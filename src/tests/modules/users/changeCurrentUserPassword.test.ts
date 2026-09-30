import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createUser, DEFAULT_PASSWORD, findAuditLogs } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const PASSWORD_URL = "/api/client/users/me/password";
const LOGIN_URL = "/api/client/session/login";
const NEW_PASSWORD = "nova-senha-forte-1";
const OTHER_PASSWORD = "senha-do-administrador-1";
/** Vantagem da escrita concorrente: tempo de sobra para a requisição conferir a senha e parar na trava da linha. */
const HEAD_START_MS = 200;

describe("PUT /api/client/users/me/password", () => {
  let app: App;

  beforeAll(async () => {
    // Este arquivo troca de senha e faz login mais vezes que o limite padrão; o 429 é testado num app próprio, no fim.
    app = await createTestApp({ loginRateLimitMax: 100 });
  });

  afterAll(async () => {
    await app.close();
  });

  function changePassword(userId: string, payload: Record<string, unknown>) {
    return app.inject({ method: "PUT", url: PASSWORD_URL, cookies: sessionCookiesFor(userId), payload });
  }

  async function storedPasswordMatches(userId: string, password: string) {
    const { password: hash } = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { password: true },
    });

    return verifyPassword(password, hash);
  }

  it("com a senha atual certa troca a senha e responde com a mensagem", async () => {
    const user = await createUser();

    const response = await changePassword(user.id, {
      currentPassword: DEFAULT_PASSWORD,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: "Senha alterada." });
    expect(await storedPasswordMatches(user.id, NEW_PASSWORD)).toBe(true);
    expect(await storedPasswordMatches(user.id, DEFAULT_PASSWORD)).toBe(false);
  });

  it("depois da troca o login funciona com a nova senha e não com a antiga", async () => {
    const user = await createUser({ email: "troca@example.com" });

    await changePassword(user.id, {
      currentPassword: DEFAULT_PASSWORD,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    const withOld = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "troca@example.com", password: DEFAULT_PASSWORD },
    });
    const withNew = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "troca@example.com", password: NEW_PASSWORD },
    });

    expect(withOld.statusCode).toBe(401);
    expect(withOld.json()).toEqual({ message: "Credenciais inválidas." });
    expect(withNew.statusCode).toBe(200);
    expect(withNew.json().user.id).toBe(user.id);
  });

  it("a sessão aberta continua válida depois da troca (o JWT não é revogado)", async () => {
    const user = await createUser();
    const cookies = sessionCookiesFor(user.id);

    await app.inject({
      method: "PUT",
      url: PASSWORD_URL,
      cookies,
      payload: { currentPassword: DEFAULT_PASSWORD, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
    });
    const me = await app.inject({ method: "GET", url: "/api/client/users/me", cookies });

    expect(me.statusCode).toBe(200);
  });

  it("não exige permissão de administrar usuários: quem não tem cargo troca a própria senha", async () => {
    const user = await createUser({ permissions: [] });

    const response = await changePassword(user.id, {
      currentPassword: DEFAULT_PASSWORD,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(200);
    expect(await storedPasswordMatches(user.id, NEW_PASSWORD)).toBe(true);
  });

  it("senha atual errada responde 400 e mantém a senha", async () => {
    const user = await createUser();

    const response = await changePassword(user.id, {
      currentPassword: "senha-errada-1",
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Senha atual incorreta." });
    expect(await storedPasswordMatches(user.id, DEFAULT_PASSWORD)).toBe(true);
  });

  it("confirmação diferente responde 400 em confirmPassword e mantém a senha", async () => {
    const user = await createUser();

    const response = await changePassword(user.id, {
      currentPassword: DEFAULT_PASSWORD,
      password: NEW_PASSWORD,
      confirmPassword: "outra-senha-1",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "confirmPassword: As senhas precisam ser iguais.",
      issues: [{ path: "confirmPassword", message: "As senhas precisam ser iguais." }],
    });
    expect(await storedPasswordMatches(user.id, DEFAULT_PASSWORD)).toBe(true);
  });

  it("nova senha igual à atual responde 400 em password", async () => {
    const user = await createUser();

    const response = await changePassword(user.id, {
      currentPassword: DEFAULT_PASSWORD,
      password: DEFAULT_PASSWORD,
      confirmPassword: DEFAULT_PASSWORD,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "password: A nova senha precisa ser diferente da atual.",
      issues: [{ path: "password", message: "A nova senha precisa ser diferente da atual." }],
    });
  });

  it.each([
    {
      path: "password",
      payload: { currentPassword: DEFAULT_PASSWORD, password: "curta", confirmPassword: "curta" },
      message: "A senha precisa ter pelo menos 8 caracteres.",
    },
    {
      path: "currentPassword",
      payload: { currentPassword: "", password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      message: "Informe a senha atual.",
    },
    {
      path: "currentPassword",
      payload: { password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      message: "Informe a senha atual.",
    },
    {
      path: "confirmPassword",
      payload: { currentPassword: DEFAULT_PASSWORD, password: NEW_PASSWORD },
      message: "Confirme a nova senha.",
    },
  ])("corpo inválido em $path responde 400 com issues", async ({ path, payload, message }) => {
    const user = await createUser();

    const response = await changePassword(user.id, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path, message }]);
    expect(await storedPasswordMatches(user.id, DEFAULT_PASSWORD)).toBe(true);
  });

  it("senha trocada por outro caminho entre a conferência e a gravação responde 409 e mantém a outra", async () => {
    const user = await createUser();
    const otherPasswordHash = await hashPassword(OTHER_PASSWORD);
    let onLocked: () => void = () => undefined;
    const locked = new Promise<void>((resolve) => {
      onLocked = resolve;
    });

    // Outra escrita (um administrador trocando a senha) segura a linha sem confirmar: a requisição confere a senha
    // atual contra o hash ainda confirmado, espera a trava e, com ela, encontra outro hash.
    const holder = prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { password: otherPasswordHash } });
      onLocked();
      await sleep(HEAD_START_MS);
    });

    await Promise.race([locked, holder]);
    const [response] = await Promise.all([
      changePassword(user.id, {
        currentPassword: DEFAULT_PASSWORD,
        password: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      }),
      holder,
    ]);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: "A senha foi alterada enquanto você fazia a troca. Tente novamente com a senha atual.",
    });
    expect(await storedPasswordMatches(user.id, OTHER_PASSWORD)).toBe(true);
    expect(await findAuditLogs(user.companyId)).toEqual([]);
  });

  it("sem sessão responde 401", async () => {
    const response = await app.inject({
      method: "PUT",
      url: PASSWORD_URL,
      payload: { currentPassword: DEFAULT_PASSWORD, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
    });

    expect(response.statusCode).toBe(401);
  });

  it("usuário bloqueado com a sessão aberta responde 403 e mantém a senha", async () => {
    const user = await createUser({ isActive: false });

    const response = await changePassword(user.id, {
      currentPassword: DEFAULT_PASSWORD,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "Conta bloqueada." });
    expect(await storedPasswordMatches(user.id, DEFAULT_PASSWORD)).toBe(true);
  });

  it("excesso de tentativas responde 429, no mesmo limite do login", async () => {
    const limitedApp = await createTestApp({ loginRateLimitMax: 2 });

    try {
      const user = await createUser();
      const attempt = () =>
        limitedApp.inject({
          method: "PUT",
          url: PASSWORD_URL,
          cookies: sessionCookiesFor(user.id),
          payload: { currentPassword: "senha-errada-1", password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
        });

      expect((await attempt()).statusCode).toBe(400);
      expect((await attempt()).statusCode).toBe(400);
      const third = await attempt();

      expect(third.statusCode).toBe(429);
      expect(third.json()).toEqual({ message: "Muitas tentativas. Aguarde um instante e tente novamente." });
    } finally {
      await limitedApp.close();
    }
  });
});

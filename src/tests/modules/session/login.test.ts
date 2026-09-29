import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { withFrozenDate } from "@/tests/helpers/clock";
import { createRole, createUser, DEFAULT_PASSWORD, findAuditLogs } from "@/tests/helpers/factories";

const LOGIN_URL = "/api/client/session/login";

describe("POST /api/client/session/login", () => {
  let app: App;

  beforeAll(async () => {
    // Este arquivo faz mais logins que o limite padrão por minuto; o 429 é testado num app próprio, no fim.
    app = await createTestApp({ loginRateLimitMax: 100 });
  });

  afterAll(async () => {
    await app.close();
  });

  it("autentica, devolve o usuário e grava o cookie HTTP-only", async () => {
    const user = await createUser({ email: "maria@example.com", name: "Maria" });

    const response = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "  MARIA@example.com ", password: DEFAULT_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      user: {
        id: user.id,
        name: "Maria",
        email: "maria@example.com",
        image: null,
        permissions: [...PERMISSION_NAMES].toSorted(),
        idleTimeoutMinutes: 20,
      },
    });

    const cookie = response.cookies.find((item) => item.name === "token");
    expect(cookie).toMatchObject({ httpOnly: true, path: "/", sameSite: "Lax" });
    expect(cookie?.value).toBeTruthy();
  });

  it("grava o último acesso em UTC junto do registro de auditoria do login, sem mexer no updatedAt", async () => {
    const user = await createUser({ email: "acesso@example.com", lastLoginAt: new Date("2026-09-01T12:00:00.000Z") });
    // Relógio da aplicação parado longe de agora: o valor gravado tem de ser o `Date` do processo, em UTC. O `now()` do
    // banco daria a hora real, e no fuso da sessão.
    const loginAt = new Date("2030-01-15T10:20:30.456Z");

    const response = await withFrozenDate(loginAt, () =>
      app.inject({
        method: "POST",
        url: LOGIN_URL,
        payload: { email: "acesso@example.com", password: DEFAULT_PASSWORD },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().user).not.toHaveProperty("lastLoginAt");

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.lastLoginAt).toEqual(loginAt);
    expect(stored.updatedAt).toEqual(user.updatedAt);
    // A coluna é `TIMESTAMP(3)` sem fuso: o texto gravado é a hora UTC, sem deslocamento.
    const [raw] = await prisma.$queryRaw<{ lastLoginAt: string }[]>`
      SELECT "lastLoginAt"::text AS "lastLoginAt" FROM users WHERE id = ${user.id}
    `;
    expect(raw?.lastLoginAt).toBe("2030-01-15 10:20:30.456");
    expect(await findAuditLogs(user.companyId)).toEqual([
      expect.objectContaining({ entityId: user.id, action: "login", before: null, after: null, changedFields: [] }),
    ]);
  });

  it("login que falha não grava o último acesso", async () => {
    const user = await createUser({ email: "falha@example.com" });
    const blocked = await createUser({ companyId: user.companyId, email: "bloq@example.com", isActive: false });

    const wrongPassword = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "falha@example.com", password: "senha-errada" },
    });
    const blockedAccount = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "bloq@example.com", password: DEFAULT_PASSWORD },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(blockedAccount.statusCode).toBe(403);

    const users = await prisma.user.findMany({ where: { id: { in: [user.id, blocked.id] } } });
    expect(users.map((row) => row.lastLoginAt)).toEqual([null, null]);
    expect(await findAuditLogs(user.companyId)).toEqual([]);
  });

  it("devolve só as permissões dos cargos do usuário, achatadas e ordenadas", async () => {
    await createUser({
      email: "leitor@example.com",
      permissions: ["backoffice.users.update", "backoffice.users.read"],
    });
    await createUser({ email: "sem-cargo@example.com", permissions: [] });

    const reader = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "leitor@example.com", password: DEFAULT_PASSWORD },
    });
    const withoutRole = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "sem-cargo@example.com", password: DEFAULT_PASSWORD },
    });

    expect(reader.statusCode).toBe(200);
    expect(reader.json().user.permissions).toEqual(["backoffice.users.read", "backoffice.users.update"]);
    expect(withoutRole.statusCode).toBe(200);
    expect(withoutRole.json().user.permissions).toEqual([]);
  });

  it("ignora vínculo com cargo de outra empresa gravado direto no banco", async () => {
    const user = await createUser({ email: "vinculo@example.com", permissions: ["backoffice.users.read"] });
    const foreignRole = await createRole({ permissions: ["backoffice.users.delete"] });
    await prisma.userRole.create({ data: { userId: user.id, roleId: foreignRole.id } });

    const response = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "vinculo@example.com", password: DEFAULT_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.permissions).toEqual(["backoffice.users.read"]);
  });

  it("não vaza o hash da senha na resposta", async () => {
    await createUser({ email: "joao@example.com" });

    const response = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "joao@example.com", password: DEFAULT_PASSWORD },
    });

    expect(response.json().user).not.toHaveProperty("password");
  });

  it("senha errada responde 401 sem revelar se o e-mail existe", async () => {
    await createUser({ email: "ana@example.com" });

    const wrongPassword = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "ana@example.com", password: "senha-errada" },
    });
    const unknownEmail = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "ninguem@example.com", password: DEFAULT_PASSWORD },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
    expect(wrongPassword.json()).toEqual({ message: "Credenciais inválidas." });
  });

  it("usuário bloqueado responde 403", async () => {
    await createUser({ email: "bloqueado@example.com", isActive: false });

    const response = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "bloqueado@example.com", password: DEFAULT_PASSWORD },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "Sua conta está bloqueada." });
  });

  it("usuário excluído logicamente não autentica", async () => {
    await createUser({ email: "excluido@example.com", deletedAt: new Date() });

    const response = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "excluido@example.com", password: DEFAULT_PASSWORD },
    });

    expect(response.statusCode).toBe(401);
  });

  it("body inválido responde 400 com a lista de campos", async () => {
    const response = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      payload: { email: "nao-e-email", password: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "email: O e-mail deve possuir o formato email@example.com.",
      issues: [
        { path: "email", message: "O e-mail deve possuir o formato email@example.com." },
        { path: "password", message: "Informe a senha." },
      ],
    });
  });

  it("JSON malformado responde 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: LOGIN_URL,
      headers: { "content-type": "application/json" },
      payload: "{ nope",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "JSON inválido." });
  });

  it("excesso de tentativas responde 429", async () => {
    const limitedApp = await createTestApp({ loginRateLimitMax: 2 });

    try {
      const attempt = () =>
        limitedApp.inject({
          method: "POST",
          url: LOGIN_URL,
          payload: { email: "x@example.com", password: "12345678" },
        });

      await attempt();
      await attempt();
      const third = await attempt();

      expect(third.statusCode).toBe(429);
      expect(third.json()).toEqual({ message: "Muitas tentativas. Aguarde um instante e tente novamente." });
    } finally {
      await limitedApp.close();
    }
  });
});

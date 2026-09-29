import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";

describe("POST /api/client/users", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("cria o usuário na empresa do autenticado e responde 201 com mensagem", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "POST",
      url: USERS_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: {
        name: "  Novo Usuário ",
        email: "Novo@Example.com",
        password: "senha-forte-1",
        confirmPassword: "senha-forte-1",
        phone: "48999999999",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      message: "Usuário criado.",
      user: expect.objectContaining({
        name: "Novo Usuário",
        email: "novo@example.com",
        phone: "48999999999",
        isActive: true,
        idleTimeoutMinutes: null,
      }),
    });

    const created = await prisma.user.findUnique({ where: { email: "novo@example.com" } });
    expect(created?.companyId).toBe(admin.companyId);
    expect(created?.password).not.toBe("senha-forte-1");
  });

  it("senhas diferentes respondem 400 apontando confirmPassword", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "POST",
      url: USERS_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: {
        name: "Fulano",
        email: "fulano@example.com",
        password: "senha-forte-1",
        confirmPassword: "outra-senha-1",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "confirmPassword", message: "As senhas precisam ser iguais." }]);
  });

  it("e-mail já usado, mesmo em outra empresa, responde 409", async () => {
    const admin = await createUser();
    await createUser({ email: "existe@example.com" });

    const response = await app.inject({
      method: "POST",
      url: USERS_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: {
        name: "Fulano",
        email: "existe@example.com",
        password: "senha-forte-1",
        confirmPassword: "senha-forte-1",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "E-mail já cadastrado." });
  });

  it("telefone fora do formato responde 400", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "POST",
      url: USERS_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: {
        name: "Fulano",
        email: "f@example.com",
        password: "senha-forte-1",
        confirmPassword: "senha-forte-1",
        phone: "abc",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0].path).toBe("phone");
  });

  describe("tempo de inatividade próprio (idleTimeoutMinutes)", () => {
    const newUserPayload = {
      name: "Fulano",
      email: "inatividade@example.com",
      password: "senha-forte-1",
      confirmPassword: "senha-forte-1",
    };

    it("grava o tempo informado e o devolve no usuário", async () => {
      const admin = await createUser();

      const response = await app.inject({
        method: "POST",
        url: USERS_URL,
        cookies: sessionCookiesFor(admin.id),
        payload: { ...newUserPayload, idleTimeoutMinutes: 45 },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().user.idleTimeoutMinutes).toBe(45);
      const created = await prisma.user.findUniqueOrThrow({ where: { email: "inatividade@example.com" } });
      expect(created.idleTimeoutMinutes).toBe(45);
    });

    it("null herda o da empresa", async () => {
      const admin = await createUser();

      const response = await app.inject({
        method: "POST",
        url: USERS_URL,
        cookies: sessionCookiesFor(admin.id),
        payload: { ...newUserPayload, idleTimeoutMinutes: null },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().user.idleTimeoutMinutes).toBeNull();
    });

    it.each([0, 481, 12.5])("%s fora da faixa responde 400 e não cria", async (idleTimeoutMinutes) => {
      const admin = await createUser();

      const response = await app.inject({
        method: "POST",
        url: USERS_URL,
        cookies: sessionCookiesFor(admin.id),
        payload: { ...newUserPayload, idleTimeoutMinutes },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().issues).toEqual([
        { path: "idleTimeoutMinutes", message: "Informe um tempo de inatividade inteiro de 1 a 480 minutos." },
      ]);
      expect(await prisma.user.count({ where: { email: "inatividade@example.com" } })).toBe(0);
    });
  });
});

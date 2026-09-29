import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ME_URL = "/api/client/users/me";

describe("rotas protegidas (hook requireSession)", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sem cookie responde 401", async () => {
    const response = await app.inject({ method: "GET", url: ME_URL });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Sessão não informada." });
  });

  it("token inválido responde 401", async () => {
    const response = await app.inject({ method: "GET", url: ME_URL, cookies: { token: "nao-e-um-jwt" } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Sessão inválida ou expirada." });
  });

  it("usuário bloqueado depois do login responde 403", async () => {
    const user = await createUser({ isActive: false });

    const response = await app.inject({ method: "GET", url: ME_URL, cookies: sessionCookiesFor(user.id) });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "Conta bloqueada." });
  });

  it("usuário excluído depois do login responde 401", async () => {
    const user = await createUser({ deletedAt: new Date() });

    const response = await app.inject({ method: "GET", url: ME_URL, cookies: sessionCookiesFor(user.id) });

    expect(response.statusCode).toBe(401);
  });

  it("sessão válida devolve o usuário em /me", async () => {
    const user = await createUser({ name: "Ativo", email: "ativo@example.com" });

    const response = await app.inject({ method: "GET", url: ME_URL, cookies: sessionCookiesFor(user.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: { id: user.id, name: "Ativo", email: "ativo@example.com", image: null } });
  });
});

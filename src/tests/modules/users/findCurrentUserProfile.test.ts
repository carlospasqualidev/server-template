import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { createTestApp } from "@/tests/helpers/app";
import { createCompany, createSystemConfig, createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const PROFILE_URL = "/api/client/users/me/profile";
const ME_URL = "/api/client/users/me";

describe("GET /api/client/users/me/profile", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  function findProfile(userId: string) {
    return app.inject({ method: "GET", url: PROFILE_URL, cookies: sessionCookiesFor(userId) });
  }

  it("devolve o perfil gravado: nome, e-mail, telefone, foto e o tempo de inatividade próprio", async () => {
    const user = await createUser({
      name: "Maria Alves",
      email: "maria@example.com",
      phone: "(48) 99999-9999",
      image: "https://cdn.example.com/maria.png",
      idleTimeoutMinutes: 15,
    });

    const response = await findProfile(user.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profile: {
        name: "Maria Alves",
        email: "maria@example.com",
        phone: "(48) 99999-9999",
        image: "https://cdn.example.com/maria.png",
        idleTimeoutMinutes: 15,
      },
    });
  });

  it("quem herda o tempo da empresa recebe null aqui e o valor resolvido na sessão", async () => {
    const company = await createCompany();
    await createSystemConfig({ companyId: company.id, key: "security.idleTimeoutMinutes", value: "60" });
    const user = await createUser({ companyId: company.id, idleTimeoutMinutes: null });

    const profile = await findProfile(user.id);
    const me = await app.inject({ method: "GET", url: ME_URL, cookies: sessionCookiesFor(user.id) });

    expect(profile.statusCode).toBe(200);
    expect(profile.json().profile).toEqual(
      expect.objectContaining({ phone: null, image: null, idleTimeoutMinutes: null }),
    );
    expect(me.json().user.idleTimeoutMinutes).toBe(60);
  });

  it("reflete a edição feita em PATCH /users/me", async () => {
    const user = await createUser({ phone: "48999999999", idleTimeoutMinutes: 10 });

    await app.inject({
      method: "PATCH",
      url: ME_URL,
      cookies: sessionCookiesFor(user.id),
      payload: { phone: "4833334444", idleTimeoutMinutes: null },
    });
    const response = await findProfile(user.id);

    expect(response.json().profile).toEqual(expect.objectContaining({ phone: "4833334444", idleTimeoutMinutes: null }));
  });

  it("não exige permissão de administrar usuários: quem não tem cargo lê o próprio perfil", async () => {
    const user = await createUser({ name: "Sem Cargo", permissions: [] });

    const response = await findProfile(user.id);

    expect(response.statusCode).toBe(200);
    expect(response.json().profile.name).toBe("Sem Cargo");
  });

  it("sem sessão responde 401", async () => {
    const response = await app.inject({ method: "GET", url: PROFILE_URL });

    expect(response.statusCode).toBe(401);
  });

  it("usuário bloqueado com a sessão aberta responde 403", async () => {
    const user = await createUser({ isActive: false });

    const response = await findProfile(user.id);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "Conta bloqueada." });
  });
});

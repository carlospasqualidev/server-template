import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { createTestApp } from "@/tests/helpers/app";
import { createCompany, createSystemConfig, createUser, DEFAULT_PASSWORD } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

type SessionUser = Awaited<ReturnType<typeof createUser>>;

interface SessionRouteCase {
  route: string;
  /** Resposta da rota de sessão para o usuário; o `user` dela traz o `idleTimeoutMinutes` resolvido. */
  fetchSessionUser: (app: App, user: SessionUser) => Promise<{ statusCode: number; idleTimeoutMinutes: unknown }>;
}

const sessionRouteCases: SessionRouteCase[] = [
  {
    route: "POST /session/login",
    fetchSessionUser: async (app, user) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/client/session/login",
        payload: { email: user.email, password: DEFAULT_PASSWORD },
      });

      return { statusCode: response.statusCode, idleTimeoutMinutes: response.json().user.idleTimeoutMinutes };
    },
  },
  {
    route: "GET /users/me",
    fetchSessionUser: async (app, user) => {
      const response = await app.inject({
        method: "GET",
        url: "/api/client/users/me",
        cookies: sessionCookiesFor(user.id),
      });

      return { statusCode: response.statusCode, idleTimeoutMinutes: response.json().user.idleTimeoutMinutes };
    },
  },
];

describe("idleTimeoutMinutes na sessão (cascata usuário → empresa → 20)", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimitMax: 100 });
  });

  afterAll(async () => {
    await app.close();
  });

  describe.each(sessionRouteCases)("$route", ({ fetchSessionUser }) => {
    it("usa o tempo do cadastro do usuário, mesmo com a empresa configurada", async () => {
      const company = await createCompany();
      await createSystemConfig({ companyId: company.id, key: "security.idleTimeoutMinutes", value: "60" });
      const user = await createUser({ companyId: company.id, idleTimeoutMinutes: 5 });

      expect(await fetchSessionUser(app, user)).toEqual({ statusCode: 200, idleTimeoutMinutes: 5 });
    });

    it("sem tempo no cadastro, usa o da configuração da empresa", async () => {
      const company = await createCompany();
      await createSystemConfig({ companyId: company.id, key: "security.idleTimeoutMinutes", value: "60" });
      const user = await createUser({ companyId: company.id });

      expect(await fetchSessionUser(app, user)).toEqual({ statusCode: 200, idleTimeoutMinutes: 60 });
    });

    it("sem tempo no cadastro nem na empresa, usa o padrão 20 (a configuração de outra empresa não conta)", async () => {
      const otherCompany = await createCompany();
      await createSystemConfig({ companyId: otherCompany.id, key: "security.idleTimeoutMinutes", value: "60" });
      const user = await createUser();

      expect(await fetchSessionUser(app, user)).toEqual({ statusCode: 200, idleTimeoutMinutes: 20 });
    });
  });

  it("GET /users/me reflete a mudança da configuração da empresa na próxima requisição", async () => {
    const admin = await createUser();

    await app.inject({
      method: "PATCH",
      url: "/api/client/system-configs",
      cookies: sessionCookiesFor(admin.id),
      payload: { items: [{ key: "security.idleTimeoutMinutes", value: "15" }] },
    });
    const me = await app.inject({ method: "GET", url: "/api/client/users/me", cookies: sessionCookiesFor(admin.id) });

    expect(me.json().user.idleTimeoutMinutes).toBe(15);
  });

  it("POST /session/register: usuário e empresa novos recebem o padrão 20", async () => {
    // Empresa e usuário nascem sem tempo definido: dos três níveis, só o padrão existe no register.
    const response = await app.inject({
      method: "POST",
      url: "/api/client/session/register",
      payload: { name: "Nova Conta", email: "nova-conta@example.com", password: "senha-forte-1" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().user.idleTimeoutMinutes).toBe(20);
  });
});

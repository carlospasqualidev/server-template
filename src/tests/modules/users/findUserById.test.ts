import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createRole, createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";

describe("GET /api/client/users/:userId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("devolve um usuário da mesma empresa", async () => {
    const admin = await createUser();
    const colleague = await createUser({ companyId: admin.companyId, name: "Colega", phone: "(48) 99999-9999" });

    const response = await app.inject({
      method: "GET",
      url: `${USERS_URL}/${colleague.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ id: colleague.id, name: "Colega", phone: "(48) 99999-9999" });
  });

  it("traz os cargos que valem, em ordem alfabética, e o último acesso", async () => {
    const admin = await createUser();
    const support = await createRole({ companyId: admin.companyId, name: "Suporte" });
    const audit = await createRole({ companyId: admin.companyId, name: "Auditoria" });
    const removed = await createRole({ companyId: admin.companyId, name: "Antigo", deletedAt: new Date() });
    const foreign = await createRole({ name: "Externo" });
    const colleague = await createUser({
      companyId: admin.companyId,
      roleIds: [support.id, audit.id, removed.id],
      lastLoginAt: new Date("2026-09-28T18:30:00.000Z"),
    });
    await prisma.userRole.create({ data: { userId: colleague.id, roleId: foreign.id } });
    const neverLoggedIn = await createUser({ companyId: admin.companyId, permissions: [] });
    const cookies = sessionCookiesFor(admin.id);

    const withRoles = await app.inject({ method: "GET", url: `${USERS_URL}/${colleague.id}`, cookies });
    const withoutRoles = await app.inject({ method: "GET", url: `${USERS_URL}/${neverLoggedIn.id}`, cookies });

    expect(withRoles.statusCode).toBe(200);
    expect(withRoles.json().user).toMatchObject({
      lastLoginAt: "2026-09-28T18:30:00.000Z",
      roles: [
        { id: audit.id, name: "Auditoria" },
        { id: support.id, name: "Suporte" },
      ],
    });
    expect(withRoles.json().user.roles[0]).not.toHaveProperty("isSystem");
    expect(withoutRoles.json().user).toMatchObject({ lastLoginAt: null, roles: [] });
    expect(withoutRoles.json().user).not.toHaveProperty("status");
  });

  it("usuário de outra empresa responde 404 (não 403)", async () => {
    const admin = await createUser();
    const outsider = await createUser();

    const response = await app.inject({
      method: "GET",
      url: `${USERS_URL}/${outsider.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Usuário não existe na base de dados." });
  });

  it("id fora do formato uuid responde 400", async () => {
    const admin = await createUser();

    const response = await app.inject({ method: "GET", url: `${USERS_URL}/123`, cookies: sessionCookiesFor(admin.id) });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "userId", message: "Identificador inválido." }]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { createTestApp } from "@/tests/helpers/app";
import { createRole, createUser, findPermissionIds } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ROLES_URL = "/api/client/roles";

describe("GET /api/client/roles/:roleId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("devolve o cargo com as permissões em ordem alfabética", async () => {
    const admin = await createUser();
    const role = await createRole({
      companyId: admin.companyId,
      name: "Suporte",
      description: "Atendimento",
      permissions: ["backoffice.users.update", "backoffice.users.read"],
    });
    await createUser({ companyId: admin.companyId, roleIds: [role.id] });
    const [readId, updateId] = await findPermissionIds(["backoffice.users.read", "backoffice.users.update"]);

    const response = await app.inject({
      method: "GET",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      role: {
        id: role.id,
        name: "Suporte",
        description: "Atendimento",
        isSystem: false,
        permissions: [
          { id: readId, name: "backoffice.users.read" },
          { id: updateId, name: "backoffice.users.update" },
        ],
        usersCount: 1,
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
      },
    });
  });

  it("id inválido responde 400", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "GET",
      url: `${ROLES_URL}/nao-e-uuid`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "roleId", message: "Identificador inválido." }]);
  });

  it("cargo de outra empresa responde 404", async () => {
    const admin = await createUser();
    const outsider = await createRole();

    const response = await app.inject({
      method: "GET",
      url: `${ROLES_URL}/${outsider.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Cargo não existe na base de dados." });
  });

  it("cargo excluído responde 404", async () => {
    const admin = await createUser();
    const deleted = await createRole({ companyId: admin.companyId, deletedAt: new Date() });

    const response = await app.inject({
      method: "GET",
      url: `${ROLES_URL}/${deleted.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(404);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createRole, createUser, findAdminRole } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ROLES_URL = "/api/client/roles";

describe("GET /api/client/roles/:roleId/users", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lista os usuários da empresa com o cargo, bloqueados inclusive, sem os excluídos", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    const active = await createUser({ companyId: admin.companyId, name: "Ana", roleIds: [role.id] });
    const blocked = await createUser({ companyId: admin.companyId, name: "Bia", roleIds: [role.id], isActive: false });
    await createUser({ companyId: admin.companyId, name: "Excluída", roleIds: [role.id], deletedAt: new Date() });
    await createUser({ companyId: admin.companyId, name: "Sem o cargo", permissions: [] });
    // Vínculo com usuário de outra empresa, só possível por escrita direta no banco: nunca aparece.
    const outsider = await createUser({ name: "De fora", permissions: [] });
    await prisma.userRole.create({ data: { userId: outsider.id, roleId: role.id } });

    const response = await app.inject({
      method: "GET",
      url: `${ROLES_URL}/${role.id}/users`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      users: [
        { id: active.id, name: "Ana", email: active.email, image: null, isActive: true },
        { id: blocked.id, name: "Bia", email: blocked.email, image: null, isActive: false },
      ],
      count: 2,
    });
  });

  it("busca por nome ou e-mail, ordena pela allowlist e pagina a partir da página 0", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    await createUser({ companyId: admin.companyId, name: "Ana", email: "zeta@example.com", roleIds: [role.id] });
    await createUser({ companyId: admin.companyId, name: "Bruno", email: "alfa@example.com", roleIds: [role.id] });
    await createUser({ companyId: admin.companyId, name: "Carla", email: "carla@example.com", roleIds: [role.id] });
    const cookies = sessionCookiesFor(admin.id);
    const url = `${ROLES_URL}/${role.id}/users`;

    const search = await app.inject({ method: "GET", url, query: { search: "ALFA" }, cookies });
    const byEmail = await app.inject({ method: "GET", url, query: { orderBy: "email", pageSize: "2" }, cookies });
    const secondPage = await app.inject({ method: "GET", url, query: { page: "1", pageSize: "2" }, cookies });

    expect(search.json()).toMatchObject({ users: [{ name: "Bruno" }], count: 1 });
    expect(byEmail.json().users.map((user: { name: string }) => user.name)).toEqual(["Bruno", "Carla"]);
    expect(byEmail.json().count).toBe(3);
    expect(secondPage.json().users.map((user: { name: string }) => user.name)).toEqual(["Carla"]);
  });

  it("lista também os usuários do cargo Administrador", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "GET",
      url: `${ROLES_URL}/${(await findAdminRole(admin.companyId)).id}/users`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.json()).toMatchObject({ users: [{ id: admin.id }], count: 1 });
  });

  it("ordenação fora da allowlist responde 400", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });

    const response = await app.inject({
      method: "GET",
      url: `${ROLES_URL}/${role.id}/users`,
      query: { orderBy: "password" },
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "orderBy", message: expect.any(String) }]);
  });

  it("cargo de outra empresa ou excluído responde 404", async () => {
    const admin = await createUser();
    const outsider = await createRole();
    const deleted = await createRole({ companyId: admin.companyId, deletedAt: new Date() });
    const cookies = sessionCookiesFor(admin.id);

    const fromOtherCompany = await app.inject({ method: "GET", url: `${ROLES_URL}/${outsider.id}/users`, cookies });
    const fromDeleted = await app.inject({ method: "GET", url: `${ROLES_URL}/${deleted.id}/users`, cookies });

    expect(fromOtherCompany.statusCode).toBe(404);
    expect(fromDeleted.statusCode).toBe(404);
  });
});

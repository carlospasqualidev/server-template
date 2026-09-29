import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createCompany, createRole, createUser, findAdminRole } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ROLES_URL = "/api/client/roles";

describe("GET /api/client/roles", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lista os cargos da empresa com as contagens de permissões e de usuários", async () => {
    const company = await createCompany();
    const admin = await createUser({ companyId: company.id });
    const role = await createRole({
      companyId: company.id,
      name: "Suporte",
      description: "Atendimento",
      permissions: ["backoffice.users.read", "backoffice.users.update"],
    });
    await createUser({ companyId: company.id, roleIds: [role.id] });
    await createUser({ companyId: company.id, roleIds: [role.id], isActive: false });
    await createUser({ companyId: company.id, roleIds: [role.id], deletedAt: new Date() });

    const response = await app.inject({ method: "GET", url: ROLES_URL, cookies: sessionCookiesFor(admin.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      roles: [
        {
          id: (await findAdminRole(company.id)).id,
          name: "Administrador",
          description: expect.any(String),
          isSystem: true,
          permissionsCount: await prisma.permission.count(),
          usersCount: 1,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
        {
          id: role.id,
          name: "Suporte",
          description: "Atendimento",
          isSystem: false,
          permissionsCount: 2,
          // O bloqueado conta (continua com o cargo); o excluído, não.
          usersCount: 2,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ],
      count: 2,
    });
  });

  it("não lista cargos excluídos nem de outra empresa", async () => {
    const admin = await createUser();
    await createRole({ companyId: admin.companyId, name: "Excluído", deletedAt: new Date() });
    await createRole({ name: "De outra empresa" });

    const response = await app.inject({ method: "GET", url: ROLES_URL, cookies: sessionCookiesFor(admin.id) });

    expect(response.json().roles.map((role: { name: string }) => role.name)).toEqual(["Administrador"]);
    expect(response.json().count).toBe(1);
  });

  it("busca por nome, sem diferenciar maiúsculas", async () => {
    const admin = await createUser();
    await createRole({ companyId: admin.companyId, name: "Financeiro" });
    await createRole({ companyId: admin.companyId, name: "Suporte" });

    const response = await app.inject({
      method: "GET",
      url: ROLES_URL,
      query: { search: "FINAN" },
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.json()).toMatchObject({ roles: [{ name: "Financeiro" }], count: 1 });
  });

  it("ordena pela allowlist e pagina a partir da página 0", async () => {
    const admin = await createUser();
    const beta = await createRole({ companyId: admin.companyId, name: "Beta" });
    const alfa = await createRole({ companyId: admin.companyId, name: "Alfa" });
    // Datas fixas: o Administrador (criado agora) é o mais novo, depois Alfa, depois Beta.
    await prisma.role.update({ where: { id: beta.id }, data: { createdAt: new Date("2020-01-01T00:00:00.000Z") } });
    await prisma.role.update({ where: { id: alfa.id }, data: { createdAt: new Date("2021-01-01T00:00:00.000Z") } });
    const cookies = sessionCookiesFor(admin.id);

    const byName = await app.inject({ method: "GET", url: ROLES_URL, query: { pageSize: "2" }, cookies });
    const byCreatedAtDesc = await app.inject({
      method: "GET",
      url: ROLES_URL,
      query: { orderBy: "createdAt", order: "desc", page: "1", pageSize: "1" },
      cookies,
    });

    expect(byName.json().roles.map((role: { name: string }) => role.name)).toEqual(["Administrador", "Alfa"]);
    expect(byName.json().count).toBe(3);
    expect(byCreatedAtDesc.json().roles.map((role: { name: string }) => role.name)).toEqual(["Alfa"]);
  });

  it("campo de ordenação fora da allowlist responde 400", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "GET",
      url: ROLES_URL,
      query: { orderBy: "isSystem" },
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "orderBy", message: expect.any(String) }]);
  });
});

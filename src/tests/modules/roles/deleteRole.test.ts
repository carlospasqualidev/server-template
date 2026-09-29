import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { raceAgainstAdminChange } from "@/tests/helpers/companyAdminsLock";
import { createRole, createUser, findAdminRole } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ROLES_URL = "/api/client/roles";

describe("DELETE /api/client/roles/:roleId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exclui logicamente: marca deletedAt e o cargo some da listagem e do detalhe", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId, name: "Temporário" });
    const cookies = sessionCookiesFor(admin.id);

    const response = await app.inject({ method: "DELETE", url: `${ROLES_URL}/${role.id}`, cookies });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: "Cargo excluído." });
    expect((await prisma.role.findUniqueOrThrow({ where: { id: role.id } })).deletedAt).toBeInstanceOf(Date);

    const detail = await app.inject({ method: "GET", url: `${ROLES_URL}/${role.id}`, cookies });
    const list = await app.inject({ method: "GET", url: ROLES_URL, cookies });
    expect(detail.statusCode).toBe(404);
    expect(list.json().roles.map((item: { name: string }) => item.name)).toEqual(["Administrador"]);
  });

  it("cargo com usuários vinculados não é excluído e responde 400", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    await createUser({ companyId: admin.companyId, roleIds: [role.id] });
    await createUser({ companyId: admin.companyId, roleIds: [role.id], isActive: false });

    const response = await app.inject({
      method: "DELETE",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Este cargo está vinculado a 2 usuários. Desvincule-os antes de excluir.",
    });
    expect((await prisma.role.findUniqueOrThrow({ where: { id: role.id } })).deletedAt).toBeNull();
  });

  it("vínculo de usuário excluído não impede a exclusão e sai junto", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    await createUser({ companyId: admin.companyId, roleIds: [role.id], deletedAt: new Date() });

    const response = await app.inject({
      method: "DELETE",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(200);
    expect(await prisma.userRole.count({ where: { roleId: role.id } })).toBe(0);
  });

  it("espera quem vincula um usuário ao cargo ao mesmo tempo e responde 400", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    const member = await createUser({ companyId: admin.companyId, permissions: [] });

    const response = await raceAgainstAdminChange({
      companyId: admin.companyId,
      lockedWrite: (tx) => tx.userRole.create({ data: { userId: member.id, roleId: role.id } }),
      operation: () =>
        app.inject({ method: "DELETE", url: `${ROLES_URL}/${role.id}`, cookies: sessionCookiesFor(admin.id) }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Este cargo está vinculado a 1 usuário. Desvincule-os antes de excluir.",
    });
    expect((await prisma.role.findUniqueOrThrow({ where: { id: role.id } })).deletedAt).toBeNull();
  });

  it("o cargo Administrador não é excluído e responde 400", async () => {
    const admin = await createUser();
    const adminRole = await findAdminRole(admin.companyId);

    const response = await app.inject({
      method: "DELETE",
      url: `${ROLES_URL}/${adminRole.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: 'O cargo "Administrador" é do sistema e não pode ser excluído.' });
    expect((await prisma.role.findUniqueOrThrow({ where: { id: adminRole.id } })).deletedAt).toBeNull();
  });

  it("cargo de outra empresa ou já excluído responde 404", async () => {
    const admin = await createUser();
    const outsider = await createRole();
    const deleted = await createRole({ companyId: admin.companyId, deletedAt: new Date() });
    const cookies = sessionCookiesFor(admin.id);

    const fromOtherCompany = await app.inject({ method: "DELETE", url: `${ROLES_URL}/${outsider.id}`, cookies });
    const fromDeleted = await app.inject({ method: "DELETE", url: `${ROLES_URL}/${deleted.id}`, cookies });

    expect(fromOtherCompany.statusCode).toBe(404);
    expect(fromDeleted.statusCode).toBe(404);
    expect((await prisma.role.findUniqueOrThrow({ where: { id: outsider.id } })).deletedAt).toBeNull();
  });

  it("id inválido responde 400", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "DELETE",
      url: `${ROLES_URL}/abc`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "roleId", message: "Identificador inválido." }]);
  });
});

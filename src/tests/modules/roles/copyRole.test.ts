import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createRole, createUser, findAdminRole, findRolePermissionNames } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ROLES_URL = "/api/client/roles";

describe("POST /api/client/roles/:roleId/copy", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("cria uma cópia com descrição e permissões do original, sem os usuários", async () => {
    const admin = await createUser();
    const source = await createRole({
      companyId: admin.companyId,
      name: "Suporte",
      description: "Atendimento",
      permissions: ["backoffice.users.read", "backoffice.users.update"],
    });
    await createUser({ companyId: admin.companyId, roleIds: [source.id] });

    const response = await app.inject({
      method: "POST",
      url: `${ROLES_URL}/${source.id}/copy`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      message: "Cargo copiado.",
      role: expect.objectContaining({
        name: "Suporte (cópia)",
        description: "Atendimento",
        isSystem: false,
        usersCount: 0,
      }),
    });
    const copyId: string = response.json().role.id;
    expect(copyId).not.toBe(source.id);
    expect(await findRolePermissionNames(copyId)).toEqual(await findRolePermissionNames(source.id));
    expect(await prisma.role.findUniqueOrThrow({ where: { id: copyId } })).toMatchObject({
      companyId: admin.companyId,
    });
  });

  it("usa o primeiro nome de cópia livre, contando os cargos excluídos", async () => {
    const admin = await createUser();
    const source = await createRole({ companyId: admin.companyId, name: "Suporte" });
    await createRole({ companyId: admin.companyId, name: "Suporte (cópia)" });
    await createRole({ companyId: admin.companyId, name: "Suporte (cópia 2)", deletedAt: new Date() });

    const response = await app.inject({
      method: "POST",
      url: `${ROLES_URL}/${source.id}/copy`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().role.name).toBe("Suporte (cópia 3)");
  });

  it("sem nome de cópia livre (50 tentativas) responde 409 e não cria o cargo", async () => {
    const admin = await createUser();
    const source = await createRole({ companyId: admin.companyId, name: "Suporte" });
    const copyNames = Array.from({ length: 50 }, (_, index) =>
      index === 0 ? "Suporte (cópia)" : `Suporte (cópia ${index + 1})`,
    );
    await prisma.role.createMany({ data: copyNames.map((name) => ({ companyId: admin.companyId, name })) });
    const rolesBefore = await prisma.role.count({ where: { companyId: admin.companyId } });

    const response = await app.inject({
      method: "POST",
      url: `${ROLES_URL}/${source.id}/copy`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: "Não foi possível gerar um nome para a cópia. Renomeie as cópias existentes.",
    });
    expect(await prisma.role.count({ where: { companyId: admin.companyId } })).toBe(rolesBefore);
  });

  describe("anti-escalonamento: ninguém concede permissão que não possui", () => {
    it("cargo com permissão fora das do autor responde 403 e não cria a cópia", async () => {
      const actor = await createUser({ permissions: ["backoffice.roles.create", "backoffice.users.read"] });
      const source = await createRole({
        companyId: actor.companyId,
        name: "Auditores",
        permissions: ["backoffice.users.read", "backoffice.audit.read"],
      });

      const response = await app.inject({
        method: "POST",
        url: `${ROLES_URL}/${source.id}/copy`,
        cookies: sessionCookiesFor(actor.id),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: "Você não pode conceder permissões que não possui." });
      expect(await prisma.role.count({ where: { name: "Auditores (cópia)" } })).toBe(0);
    });

    it("autor com todas as permissões do cargo copia", async () => {
      const actor = await createUser({
        permissions: ["backoffice.roles.create", "backoffice.users.read", "backoffice.audit.read"],
      });
      const source = await createRole({
        companyId: actor.companyId,
        name: "Auditores",
        permissions: ["backoffice.users.read", "backoffice.audit.read"],
      });

      const response = await app.inject({
        method: "POST",
        url: `${ROLES_URL}/${source.id}/copy`,
        cookies: sessionCookiesFor(actor.id),
      });

      expect(response.statusCode).toBe(201);
      expect(await findRolePermissionNames(response.json().role.id)).toEqual([
        "backoffice.audit.read",
        "backoffice.users.read",
      ]);
    });
  });

  it("o cargo Administrador não é copiado e responde 400", async () => {
    const admin = await createUser();
    const adminRole = await findAdminRole(admin.companyId);

    const response = await app.inject({
      method: "POST",
      url: `${ROLES_URL}/${adminRole.id}/copy`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: 'O cargo "Administrador" é do sistema e não pode ser copiado.' });
    expect(await prisma.role.count({ where: { companyId: admin.companyId } })).toBe(1);
  });

  it("cargo de outra empresa ou excluído responde 404", async () => {
    const admin = await createUser();
    const outsider = await createRole();
    const deleted = await createRole({ companyId: admin.companyId, deletedAt: new Date() });
    const cookies = sessionCookiesFor(admin.id);

    const fromOtherCompany = await app.inject({ method: "POST", url: `${ROLES_URL}/${outsider.id}/copy`, cookies });
    const fromDeleted = await app.inject({ method: "POST", url: `${ROLES_URL}/${deleted.id}/copy`, cookies });

    expect(fromOtherCompany.statusCode).toBe(404);
    expect(fromDeleted.statusCode).toBe(404);
  });

  it("id inválido responde 400", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "POST",
      url: `${ROLES_URL}/123/copy`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "roleId", message: "Identificador inválido." }]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import {
  createRole,
  createUser,
  findAdminRole,
  findPermissionIds,
  findRolePermissionNames,
} from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ROLES_URL = "/api/client/roles";

describe("PUT /api/client/roles/:roleId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("substitui nome, descrição e o conjunto de permissões (com a expansão)", async () => {
    const admin = await createUser();
    const role = await createRole({
      companyId: admin.companyId,
      name: "Suporte",
      description: "Antes",
      permissions: ["backoffice.users.read", "backoffice.audit.read"],
    });

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Suporte N2", permissionIds: await findPermissionIds(["backoffice.roles.update"]) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "Cargo atualizado.",
      role: expect.objectContaining({
        id: role.id,
        name: "Suporte N2",
        description: null,
        permissions: [
          { id: expect.any(String), name: "backoffice.roles.read" },
          { id: expect.any(String), name: "backoffice.roles.update" },
        ],
      }),
    });
    expect(await findRolePermissionNames(role.id)).toEqual(["backoffice.roles.read", "backoffice.roles.update"]);
  });

  it("quem tem o cargo passa a ter as permissões novas na próxima requisição", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId, permissions: ["backoffice.users.read"] });
    const member = await createUser({ companyId: admin.companyId, roleIds: [role.id] });

    await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Auditores", permissionIds: await findPermissionIds(["backoffice.audit.read"]) },
    });
    const me = await app.inject({ method: "GET", url: "/api/client/users/me", cookies: sessionCookiesFor(member.id) });

    expect(me.json().user.permissions).toEqual(["backoffice.audit.read"]);
  });

  it("manter o próprio nome não é conflito", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId, name: "Suporte" });

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Suporte", permissionIds: await findPermissionIds(["backoffice.users.read"]) },
    });

    expect(response.statusCode).toBe(200);
  });

  it("nome de outro cargo da empresa, ativo ou excluído, responde 409", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId, name: "Suporte" });
    await createRole({ companyId: admin.companyId, name: "Financeiro" });
    await createRole({ companyId: admin.companyId, name: "Antigo", deletedAt: new Date() });
    const permissionIds = await findPermissionIds(["backoffice.users.read"]);
    const cookies = sessionCookiesFor(admin.id);

    const active = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}`,
      cookies,
      payload: { name: "Financeiro", permissionIds },
    });
    const deleted = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}`,
      cookies,
      payload: { name: "Antigo", permissionIds },
    });

    expect(active.statusCode).toBe(409);
    expect(active.json()).toEqual({ message: "Já existe um cargo com este nome." });
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json()).toEqual({ message: "Este nome pertence a um cargo excluído. Escolha outro nome." });
    expect((await prisma.role.findUniqueOrThrow({ where: { id: role.id } })).name).toBe("Suporte");
  });

  it("o cargo Administrador não é editado e responde 400", async () => {
    const admin = await createUser();
    const adminRole = await findAdminRole(admin.companyId);
    const permissionsBefore = await findRolePermissionNames(adminRole.id);

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${adminRole.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Chefe", permissionIds: await findPermissionIds(["backoffice.users.read"]) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: 'O cargo "Administrador" é do sistema e não pode ser editado.' });
    expect((await prisma.role.findUniqueOrThrow({ where: { id: adminRole.id } })).name).toBe("Administrador");
    expect(await findRolePermissionNames(adminRole.id)).toEqual(permissionsBefore);
  });

  it("permissão inexistente responde 400 e não altera nada", async () => {
    const admin = await createUser();
    const role = await createRole({
      companyId: admin.companyId,
      name: "Suporte",
      permissions: ["backoffice.users.read"],
    });

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Outro", permissionIds: ["01900000-0000-7000-8000-000000000000"] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Uma ou mais permissões informadas não existem." });
    expect((await prisma.role.findUniqueOrThrow({ where: { id: role.id } })).name).toBe("Suporte");
    expect(await findRolePermissionNames(role.id)).toEqual(["backoffice.users.read"]);
  });

  it("corpo inválido responde 400 com os campos", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Suporte", permissionIds: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([
      { path: "permissionIds", message: "Selecione ao menos uma permissão para o cargo." },
    ]);
  });

  it("cargo de outra empresa ou excluído responde 404", async () => {
    const admin = await createUser();
    const outsider = await createRole();
    const deleted = await createRole({ companyId: admin.companyId, deletedAt: new Date() });
    const payload = { name: "Invasão", permissionIds: await findPermissionIds(["backoffice.users.read"]) };
    const cookies = sessionCookiesFor(admin.id);

    const fromOtherCompany = await app.inject({ method: "PUT", url: `${ROLES_URL}/${outsider.id}`, cookies, payload });
    const fromDeleted = await app.inject({ method: "PUT", url: `${ROLES_URL}/${deleted.id}`, cookies, payload });

    expect(fromOtherCompany.statusCode).toBe(404);
    expect(fromDeleted.statusCode).toBe(404);
    expect((await prisma.role.findUniqueOrThrow({ where: { id: outsider.id } })).name).not.toBe("Invasão");
  });

  describe("anti-escalonamento: ninguém acrescenta ao cargo permissão que não possui", () => {
    it("acrescentar permissão fora das do autor responde 403 e não altera nada", async () => {
      const actor = await createUser({ permissions: ["backoffice.roles.update", "backoffice.users.read"] });
      const role = await createRole({
        companyId: actor.companyId,
        name: "Suporte",
        permissions: ["backoffice.users.read"],
      });

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}`,
        cookies: sessionCookiesFor(actor.id),
        payload: {
          name: "Suporte com auditoria",
          permissionIds: await findPermissionIds(["backoffice.users.read", "backoffice.audit.read"]),
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: "Você não pode conceder permissões que não possui." });
      expect((await prisma.role.findUniqueOrThrow({ where: { id: role.id } })).name).toBe("Suporte");
      expect(await findRolePermissionNames(role.id)).toEqual(["backoffice.users.read"]);
    });

    it("manter ou retirar permissão que o autor não possui é permitido", async () => {
      const actor = await createUser({ permissions: ["backoffice.roles.update", "backoffice.users.read"] });
      const role = await createRole({
        companyId: actor.companyId,
        permissions: ["backoffice.users.read", "backoffice.audit.read", "backoffice.systemConfigs.read"],
      });

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}`,
        cookies: sessionCookiesFor(actor.id),
        payload: {
          name: "Sem configurações",
          permissionIds: await findPermissionIds(["backoffice.users.read", "backoffice.audit.read"]),
        },
      });

      expect(response.statusCode).toBe(200);
      expect(await findRolePermissionNames(role.id)).toEqual(["backoffice.audit.read", "backoffice.users.read"]);
    });

    it("autor com todas as permissões acrescentadas edita", async () => {
      const actor = await createUser({
        permissions: ["backoffice.roles.update", "backoffice.users.read", "backoffice.audit.read"],
      });
      const role = await createRole({ companyId: actor.companyId, permissions: ["backoffice.users.read"] });

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}`,
        cookies: sessionCookiesFor(actor.id),
        payload: {
          name: "Suporte com auditoria",
          permissionIds: await findPermissionIds(["backoffice.users.read", "backoffice.audit.read"]),
        },
      });

      expect(response.statusCode).toBe(200);
      expect(await findRolePermissionNames(role.id)).toEqual(["backoffice.audit.read", "backoffice.users.read"]);
    });
  });
});

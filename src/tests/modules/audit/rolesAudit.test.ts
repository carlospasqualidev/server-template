import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createRole, createUser, findAuditLogs, findPermissionIds } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ROLES_URL = "/api/client/roles";

describe("trilha de auditoria: cargos", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("criar cargo registra nome, descrição e permissões (com o `read` implícito)", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: {
        name: "Suporte",
        description: "Atendimento",
        permissionIds: await findPermissionIds(["backoffice.users.update"]),
      },
    });

    expect(response.statusCode).toBe(201);
    expect(await findAuditLogs(admin.companyId)).toEqual([
      expect.objectContaining({
        module: "SECURITY",
        entity: "Role",
        entityId: response.json().role.id,
        action: "create",
        description: "Criou um cargo",
        before: null,
        after: {
          name: "Suporte",
          description: "Atendimento",
          permissions: "backoffice.users.read, backoffice.users.update",
        },
        changedFields: [],
        userId: admin.id,
      }),
    ]);
  });

  it("criar cargo com nome já existente responde 409 e não grava registro", async () => {
    const admin = await createUser();
    await createRole({ companyId: admin.companyId, name: "Suporte" });

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Suporte", permissionIds: await findPermissionIds(["backoffice.users.read"]) },
    });

    expect(response.statusCode).toBe(409);
    expect(await findAuditLogs(admin.companyId)).toEqual([]);
  });

  it("criar cargo com permissão que o autor não possui responde 403 e não grava registro", async () => {
    const actor = await createUser({ permissions: ["backoffice.roles.create", "backoffice.users.read"] });

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(actor.id),
      payload: { name: "Auditores", permissionIds: await findPermissionIds(["backoffice.audit.read"]) },
    });

    expect(response.statusCode).toBe(403);
    expect(await findAuditLogs(actor.companyId)).toEqual([]);
  });

  it("copiar cargo registra a criação da cópia", async () => {
    const admin = await createUser();
    const source = await createRole({
      companyId: admin.companyId,
      name: "Suporte",
      permissions: ["backoffice.users.read"],
    });

    const response = await app.inject({
      method: "POST",
      url: `${ROLES_URL}/${source.id}/copy`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(201);
    expect(await findAuditLogs(admin.companyId)).toEqual([
      expect.objectContaining({
        entity: "Role",
        entityId: response.json().role.id,
        action: "create",
        description: "Copiou um cargo",
        after: { name: "Suporte (cópia)", description: null, permissions: "backoffice.users.read" },
        userId: admin.id,
      }),
    ]);
  });

  it("copiar cargo com permissão que o autor não possui responde 403 e não grava registro", async () => {
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
    expect(await findAuditLogs(actor.companyId)).toEqual([]);
  });

  it("editar cargo registra antes e depois com os campos alterados", async () => {
    const admin = await createUser();
    const role = await createRole({
      companyId: admin.companyId,
      name: "Suporte",
      description: "Antes",
      permissions: ["backoffice.users.read"],
    });

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: {
        name: "Suporte",
        description: "Depois",
        permissionIds: await findPermissionIds(["backoffice.users.read", "backoffice.roles.read"]),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(await findAuditLogs(admin.companyId)).toEqual([
      expect.objectContaining({
        entity: "Role",
        entityId: role.id,
        action: "update",
        description: "Alterou um cargo",
        before: { name: "Suporte", description: "Antes", permissions: "backoffice.users.read" },
        after: { name: "Suporte", description: "Depois", permissions: "backoffice.roles.read, backoffice.users.read" },
        changedFields: ["description", "permissions"],
        userId: admin.id,
      }),
    ]);
  });

  it("editar acrescentando permissão que o autor não possui responde 403 e não grava registro", async () => {
    const actor = await createUser({ permissions: ["backoffice.roles.update", "backoffice.users.read"] });
    const role = await createRole({ companyId: actor.companyId, permissions: ["backoffice.users.read"] });

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(actor.id),
      payload: { name: "Novo", permissionIds: await findPermissionIds(["backoffice.audit.read"]) },
    });

    expect(response.statusCode).toBe(403);
    expect(await findAuditLogs(actor.companyId)).toEqual([]);
  });

  it("excluir cargo registra o estado anterior", async () => {
    const admin = await createUser();
    const role = await createRole({
      companyId: admin.companyId,
      name: "Temporário",
      permissions: ["backoffice.users.read"],
    });

    const response = await app.inject({
      method: "DELETE",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(200);
    expect(await findAuditLogs(admin.companyId)).toEqual([
      expect.objectContaining({
        entity: "Role",
        entityId: role.id,
        action: "delete",
        description: "Excluiu um cargo",
        before: { name: "Temporário", description: null, permissions: "backoffice.users.read" },
        after: null,
        userId: admin.id,
      }),
    ]);
  });

  it("excluir cargo com usuários responde 400 e não grava registro", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId, permissions: ["backoffice.users.read"] });
    await createUser({ companyId: admin.companyId, roleIds: [role.id] });

    const response = await app.inject({
      method: "DELETE",
      url: `${ROLES_URL}/${role.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(await findAuditLogs(admin.companyId)).toEqual([]);
  });

  describe("PUT /roles/:roleId/users", () => {
    it("registra cada usuário que entra e que sai, com os cargos dele antes e depois", async () => {
      const admin = await createUser();
      const role = await createRole({
        companyId: admin.companyId,
        name: "Suporte",
        permissions: ["backoffice.users.read"],
      });
      const finance = await createRole({
        companyId: admin.companyId,
        name: "Financeiro",
        permissions: ["backoffice.users.read"],
      });
      const stays = await createUser({ companyId: admin.companyId, roleIds: [role.id] });
      const leaves = await createUser({ companyId: admin.companyId, roleIds: [role.id, finance.id] });
      const joins = await createUser({ companyId: admin.companyId, roleIds: [finance.id] });

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}/users`,
        cookies: sessionCookiesFor(admin.id),
        payload: { userIds: [stays.id, joins.id] },
      });

      expect(response.statusCode).toBe(200);
      const logs = await findAuditLogs(admin.companyId);

      expect(logs).toHaveLength(2);
      expect(logs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            module: "SECURITY",
            entity: "User",
            entityId: joins.id,
            action: "update",
            description: "Incluiu um usuário em um cargo",
            before: { roles: "Financeiro" },
            after: { roles: "Financeiro, Suporte" },
            changedFields: ["roles"],
            userId: admin.id,
          }),
          expect.objectContaining({
            entity: "User",
            entityId: leaves.id,
            action: "update",
            description: "Retirou um usuário de um cargo",
            before: { roles: "Financeiro, Suporte" },
            after: { roles: "Financeiro" },
            changedFields: ["roles"],
          }),
        ]),
      );
    });

    it("esvaziar o cargo registra todos que saem, sem registrar usuário excluído", async () => {
      const admin = await createUser();
      const role = await createRole({
        companyId: admin.companyId,
        name: "Suporte",
        permissions: ["backoffice.users.read"],
      });
      const first = await createUser({ companyId: admin.companyId, roleIds: [role.id] });
      const second = await createUser({ companyId: admin.companyId, roleIds: [role.id] });
      await createUser({ companyId: admin.companyId, roleIds: [role.id], deletedAt: new Date() });

      await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}/users`,
        cookies: sessionCookiesFor(admin.id),
        payload: { userIds: [] },
      });

      const logs = await findAuditLogs(admin.companyId);

      expect(logs.map((log) => log.entityId).toSorted()).toEqual([first.id, second.id].toSorted());
      expect(logs.every((log) => log.description === "Retirou um usuário de um cargo")).toBe(true);
      expect(logs.map((log) => log.after)).toEqual([{ roles: null }, { roles: null }]);
    });

    it("mesmo conjunto não grava registro", async () => {
      const admin = await createUser();
      const role = await createRole({ companyId: admin.companyId, permissions: ["backoffice.users.read"] });
      const member = await createUser({ companyId: admin.companyId, roleIds: [role.id] });

      await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}/users`,
        cookies: sessionCookiesFor(admin.id),
        payload: { userIds: [member.id] },
      });

      expect(await findAuditLogs(admin.companyId)).toEqual([]);
    });

    it("usuário de outra empresa responde 404, ninguém sai do cargo e nada é gravado", async () => {
      const admin = await createUser();
      const role = await createRole({ companyId: admin.companyId, permissions: ["backoffice.users.read"] });
      const member = await createUser({ companyId: admin.companyId, roleIds: [role.id] });
      const outsider = await createUser();

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}/users`,
        cookies: sessionCookiesFor(admin.id),
        payload: { userIds: [outsider.id] },
      });

      expect(response.statusCode).toBe(404);
      expect(await findAuditLogs(admin.companyId)).toEqual([]);
      expect(await findAuditLogs(outsider.companyId)).toEqual([]);
      expect(await prisma.userRole.count({ where: { roleId: role.id, userId: member.id } })).toBe(1);
    });
  });
});

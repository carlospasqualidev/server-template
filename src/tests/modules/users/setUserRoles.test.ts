import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { raceAgainstAdminChange } from "@/tests/helpers/companyAdminsLock";
import { createRole, createUser, findAdminRole } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";
const LAST_ADMIN_MESSAGE = "Não é possível retirar o cargo Administrador do último administrador ativo da empresa.";
const GRANT_BEYOND_OWN_MESSAGE = "Você não pode conceder permissões que não possui.";
const ADMIN_ROLE_CHANGE_MESSAGE = 'Só quem tem o cargo "Administrador" pode atribuí-lo ou retirá-lo de alguém.';

async function roleIdsOf(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });

  return userRoles.map((userRole) => userRole.roleId).toSorted();
}

describe("PUT /api/client/users/:userId/roles", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("substitui os cargos do usuário e responde com o usuário e os cargos", async () => {
    const admin = await createUser();
    const oldRole = await createRole({ companyId: admin.companyId, name: "Antigo" });
    const support = await createRole({ companyId: admin.companyId, name: "Suporte" });
    const audit = await createRole({ companyId: admin.companyId, name: "Auditoria" });
    const target = await createUser({ companyId: admin.companyId, roleIds: [oldRole.id] });

    const response = await app.inject({
      method: "PUT",
      url: `${USERS_URL}/${target.id}/roles`,
      cookies: sessionCookiesFor(admin.id),
      payload: { roleIds: [support.id, audit.id, audit.id] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "Cargos do usuário atualizados.",
      user: expect.objectContaining({
        id: target.id,
        email: target.email,
        isActive: true,
        roles: [
          { id: audit.id, name: "Auditoria", isSystem: false },
          { id: support.id, name: "Suporte", isSystem: false },
        ],
      }),
    });
    expect(response.json().user).not.toHaveProperty("password");
    expect(await roleIdsOf(target.id)).toEqual([support.id, audit.id].toSorted());
  });

  it("lista vazia deixa o usuário sem cargo e sem permissões", async () => {
    const admin = await createUser();
    const target = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.read"] });

    const response = await app.inject({
      method: "PUT",
      url: `${USERS_URL}/${target.id}/roles`,
      cookies: sessionCookiesFor(admin.id),
      payload: { roleIds: [] },
    });
    const me = await app.inject({ method: "GET", url: `${USERS_URL}/me`, cookies: sessionCookiesFor(target.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.roles).toEqual([]);
    expect(me.json().user.permissions).toEqual([]);
  });

  it("dar o cargo Administrador concede o catálogo inteiro", async () => {
    const admin = await createUser();
    const target = await createUser({ companyId: admin.companyId, permissions: [] });

    await app.inject({
      method: "PUT",
      url: `${USERS_URL}/${target.id}/roles`,
      cookies: sessionCookiesFor(admin.id),
      payload: { roleIds: [(await findAdminRole(admin.companyId)).id] },
    });
    const me = await app.inject({ method: "GET", url: `${USERS_URL}/me`, cookies: sessionCookiesFor(target.id) });

    expect(me.json().user.permissions).toEqual([...PERMISSION_NAMES].toSorted());
  });

  it("alterar os próprios cargos responde 400", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    const adminRoleId = (await findAdminRole(admin.companyId)).id;

    const response = await app.inject({
      method: "PUT",
      url: `${USERS_URL}/${admin.id}/roles`,
      cookies: sessionCookiesFor(admin.id),
      payload: { roleIds: [adminRoleId, role.id] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Você não pode alterar os seus próprios cargos de acesso. Peça a outro administrador.",
    });
    expect(await roleIdsOf(admin.id)).toEqual([adminRoleId]);
  });

  describe("anti-escalonamento: ninguém atribui a alguém permissão que não possui", () => {
    it("cargo com permissão fora das do autor responde 403 e não altera nada", async () => {
      const actor = await createUser({ permissions: ["backoffice.users.update"] });
      const role = await createRole({ companyId: actor.companyId, permissions: ["backoffice.audit.read"] });
      const target = await createUser({ companyId: actor.companyId, permissions: [] });

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/${target.id}/roles`,
        cookies: sessionCookiesFor(actor.id),
        payload: { roleIds: [role.id] },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: GRANT_BEYOND_OWN_MESSAGE });
      expect(await roleIdsOf(target.id)).toEqual([]);
    });

    it("manter um cargo com permissão fora das do autor é permitido", async () => {
      const actor = await createUser({ permissions: ["backoffice.users.update"] });
      const kept = await createRole({ companyId: actor.companyId, permissions: ["backoffice.audit.read"] });
      const added = await createRole({ companyId: actor.companyId, permissions: ["backoffice.users.update"] });
      const target = await createUser({ companyId: actor.companyId, roleIds: [kept.id] });

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/${target.id}/roles`,
        cookies: sessionCookiesFor(actor.id),
        payload: { roleIds: [kept.id, added.id] },
      });

      expect(response.statusCode).toBe(200);
      expect(await roleIdsOf(target.id)).toEqual([kept.id, added.id].toSorted());
    });

    it("autor com todas as permissões do cargo atribui", async () => {
      const actor = await createUser({ permissions: ["backoffice.users.update", "backoffice.audit.read"] });
      const role = await createRole({ companyId: actor.companyId, permissions: ["backoffice.audit.read"] });
      const target = await createUser({ companyId: actor.companyId, permissions: [] });

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/${target.id}/roles`,
        cookies: sessionCookiesFor(actor.id),
        payload: { roleIds: [role.id] },
      });

      expect(response.statusCode).toBe(200);
      expect(await roleIdsOf(target.id)).toEqual([role.id]);
    });

    it("atribuir o cargo Administrador sem tê-lo responde 403, mesmo com todas as permissões", async () => {
      const actor = await createUser({ permissions: PERMISSION_NAMES });
      const target = await createUser({ companyId: actor.companyId, permissions: [] });

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/${target.id}/roles`,
        cookies: sessionCookiesFor(actor.id),
        payload: { roleIds: [(await findAdminRole(actor.companyId)).id] },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: ADMIN_ROLE_CHANGE_MESSAGE });
      expect(await roleIdsOf(target.id)).toEqual([]);
    });

    it("retirar o cargo Administrador sem tê-lo responde 403", async () => {
      const admin = await createUser();
      const otherAdmin = await createUser({ companyId: admin.companyId });
      const actor = await createUser({ companyId: admin.companyId, permissions: PERMISSION_NAMES });
      const adminRoleId = (await findAdminRole(admin.companyId)).id;

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/${otherAdmin.id}/roles`,
        cookies: sessionCookiesFor(actor.id),
        payload: { roleIds: [] },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: ADMIN_ROLE_CHANGE_MESSAGE });
      expect(await roleIdsOf(otherAdmin.id)).toEqual([adminRoleId]);
    });
  });

  describe("último administrador ativo da empresa", () => {
    it("com outro administrador ativo, retira o cargo", async () => {
      const admin = await createUser();
      const otherAdmin = await createUser({ companyId: admin.companyId });
      const role = await createRole({ companyId: admin.companyId });

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/${otherAdmin.id}/roles`,
        cookies: sessionCookiesFor(admin.id),
        payload: { roleIds: [role.id] },
      });

      expect(response.statusCode).toBe(200);
      expect(await roleIdsOf(otherAdmin.id)).toEqual([role.id]);
    });

    it("manter o cargo Administrador e trocar os outros é permitido mesmo para o último", async () => {
      const admin = await createUser();
      const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.update"] });
      const adminRoleId = (await findAdminRole(admin.companyId)).id;
      const role = await createRole({ companyId: admin.companyId });

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/${admin.id}/roles`,
        cookies: sessionCookiesFor(manager.id),
        payload: { roleIds: [adminRoleId, role.id] },
      });

      expect(response.statusCode).toBe(200);
      expect(await roleIdsOf(admin.id)).toEqual([adminRoleId, role.id].toSorted());
    });

    // Quem retira o `Administrador` também o tem: o alvo só vira o último quando o autor perde o acesso no meio da
    // requisição, bloqueado por outro administrador que segurava a trava.
    it("espera quem bloqueia o autor ao mesmo tempo e responde 400 (administrador bloqueado não conta)", async () => {
      const admin = await createUser();
      const target = await createUser({ companyId: admin.companyId });
      await createUser({ companyId: admin.companyId, isActive: false });
      const adminRoleId = (await findAdminRole(admin.companyId)).id;

      const response = await raceAgainstAdminChange({
        companyId: admin.companyId,
        lockedWrite: (tx) => tx.user.update({ where: { id: admin.id }, data: { isActive: false } }),
        operation: () =>
          app.inject({
            method: "PUT",
            url: `${USERS_URL}/${target.id}/roles`,
            cookies: sessionCookiesFor(admin.id),
            payload: { roleIds: [] },
          }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: LAST_ADMIN_MESSAGE });
      expect(await roleIdsOf(target.id)).toEqual([adminRoleId]);
    });
  });

  it("usuário excluído ao mesmo tempo responde 404 e não altera nada", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    const target = await createUser({ companyId: admin.companyId, permissions: [] });

    const response = await raceAgainstAdminChange({
      companyId: admin.companyId,
      lockedWrite: (tx) =>
        tx.user.update({ where: { id: target.id }, data: { deletedAt: new Date(), isActive: false } }),
      operation: () =>
        app.inject({
          method: "PUT",
          url: `${USERS_URL}/${target.id}/roles`,
          cookies: sessionCookiesFor(admin.id),
          payload: { roleIds: [role.id] },
        }),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Usuário não existe na base de dados." });
    expect(await roleIdsOf(target.id)).toEqual([]);
  });

  it("cargo de outra empresa ou excluído responde 404 e não altera nada", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    const outsiderRole = await createRole();
    const deletedRole = await createRole({ companyId: admin.companyId, deletedAt: new Date() });
    const target = await createUser({ companyId: admin.companyId, permissions: [] });
    const cookies = sessionCookiesFor(admin.id);
    const url = `${USERS_URL}/${target.id}/roles`;

    const withOutsider = await app.inject({
      method: "PUT",
      url,
      cookies,
      payload: { roleIds: [role.id, outsiderRole.id] },
    });
    const withDeleted = await app.inject({
      method: "PUT",
      url,
      cookies,
      payload: { roleIds: [role.id, deletedRole.id] },
    });

    expect(withOutsider.statusCode).toBe(404);
    expect(withOutsider.json()).toEqual({ message: "Um ou mais cargos informados não existem na base de dados." });
    expect(withDeleted.statusCode).toBe(404);
    expect(await roleIdsOf(target.id)).toEqual([]);
  });

  it("usuário de outra empresa ou excluído responde 404", async () => {
    const admin = await createUser();
    const outsider = await createUser({ permissions: [] });
    const deleted = await createUser({ companyId: admin.companyId, permissions: [], deletedAt: new Date() });
    const cookies = sessionCookiesFor(admin.id);

    const fromOtherCompany = await app.inject({
      method: "PUT",
      url: `${USERS_URL}/${outsider.id}/roles`,
      cookies,
      payload: { roleIds: [] },
    });
    const fromDeleted = await app.inject({
      method: "PUT",
      url: `${USERS_URL}/${deleted.id}/roles`,
      cookies,
      payload: { roleIds: [] },
    });

    expect(fromOtherCompany.statusCode).toBe(404);
    expect(fromOtherCompany.json()).toEqual({ message: "Usuário não existe na base de dados." });
    expect(fromDeleted.statusCode).toBe(404);
  });

  it("corpo inválido responde 400 com os campos", async () => {
    const admin = await createUser();
    const target = await createUser({ companyId: admin.companyId, permissions: [] });
    const cookies = sessionCookiesFor(admin.id);
    const url = `${USERS_URL}/${target.id}/roles`;

    const missing = await app.inject({ method: "PUT", url, cookies, payload: {} });
    const invalidId = await app.inject({ method: "PUT", url, cookies, payload: { roleIds: ["x"] } });
    const tooMany = await app.inject({
      method: "PUT",
      url,
      cookies,
      payload: { roleIds: Array.from({ length: 1001 }, () => target.id) },
    });

    expect(missing.json().issues).toEqual([{ path: "roleIds", message: "Informe os cargos do usuário." }]);
    expect(invalidId.json().issues).toEqual([{ path: "roleIds.0", message: "Identificador inválido." }]);
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().issues).toEqual([{ path: "roleIds", message: "Informe no máximo 1000 cargos." }]);
  });
});

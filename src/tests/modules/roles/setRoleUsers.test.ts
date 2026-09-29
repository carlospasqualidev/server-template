import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { raceAgainstAdminChange } from "@/tests/helpers/companyAdminsLock";
import { createRole, createUser, findAdminRole } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ROLES_URL = "/api/client/roles";
const OWN_ROLES_MESSAGE = "Você não pode alterar os seus próprios cargos de acesso. Peça a outro administrador.";
const GRANT_BEYOND_OWN_MESSAGE = "Você não pode conceder permissões que não possui.";

async function memberIdsOf(roleId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({ where: { roleId }, select: { userId: true } });

  return userRoles.map((userRole) => userRole.userId).toSorted();
}

describe("PUT /api/client/roles/:roleId/users", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("substitui os usuários do cargo: quem entra ganha, quem sai perde", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId, permissions: ["backoffice.audit.read"] });
    const staying = await createUser({ companyId: admin.companyId, roleIds: [role.id] });
    // Tem o cargo e fica de fora da lista: perde o cargo.
    await createUser({ companyId: admin.companyId, roleIds: [role.id] });
    const joining = await createUser({ companyId: admin.companyId, permissions: [] });

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}/users`,
      cookies: sessionCookiesFor(admin.id),
      payload: { userIds: [staying.id, joining.id, joining.id] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "Usuários do cargo atualizados.",
      role: expect.objectContaining({ id: role.id, usersCount: 2 }),
    });
    expect(await memberIdsOf(role.id)).toEqual([staying.id, joining.id].toSorted());

    const joiningSession = await app.inject({
      method: "GET",
      url: "/api/client/users/me",
      cookies: sessionCookiesFor(joining.id),
    });
    expect(joiningSession.json().user.permissions).toEqual(["backoffice.audit.read"]);
  });

  it("lista vazia tira o cargo de todos", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    await createUser({ companyId: admin.companyId, roleIds: [role.id] });

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}/users`,
      cookies: sessionCookiesFor(admin.id),
      payload: { userIds: [] },
    });

    expect(response.statusCode).toBe(200);
    expect(await memberIdsOf(role.id)).toEqual([]);
  });

  it("vínculo de usuário excluído fica como está", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    const deleted = await createUser({ companyId: admin.companyId, roleIds: [role.id], deletedAt: new Date() });

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}/users`,
      cookies: sessionCookiesFor(admin.id),
      payload: { userIds: [] },
    });

    expect(response.statusCode).toBe(200);
    expect(await memberIdsOf(role.id)).toEqual([deleted.id]);
  });

  describe("ninguém altera os próprios cargos", () => {
    it("incluir a si mesmo responde 400", async () => {
      const actor = await createUser({ permissions: ["backoffice.roles.update", "backoffice.users.update"] });
      const role = await createRole({ companyId: actor.companyId, permissions: ["backoffice.audit.read"] });

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}/users`,
        cookies: sessionCookiesFor(actor.id),
        payload: { userIds: [actor.id] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: OWN_ROLES_MESSAGE });
      expect(await memberIdsOf(role.id)).toEqual([]);
    });

    it("retirar a si mesmo responde 400", async () => {
      const admin = await createUser();
      const role = await createRole({ companyId: admin.companyId });
      await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}/users`,
        cookies: sessionCookiesFor(admin.id),
        payload: { userIds: [] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: OWN_ROLES_MESSAGE });
      expect(await memberIdsOf(role.id)).toEqual([admin.id]);
    });

    it("continuar no cargo enquanto muda os outros é permitido", async () => {
      const admin = await createUser();
      const role = await createRole({ companyId: admin.companyId });
      await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
      const joining = await createUser({ companyId: admin.companyId, permissions: [] });

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}/users`,
        cookies: sessionCookiesFor(admin.id),
        payload: { userIds: [admin.id, joining.id] },
      });

      expect(response.statusCode).toBe(200);
      expect(await memberIdsOf(role.id)).toEqual([admin.id, joining.id].toSorted());
    });
  });

  it("os usuários do cargo Administrador não mudam por aqui e responde 400", async () => {
    const admin = await createUser();
    const otherAdmin = await createUser({ companyId: admin.companyId });
    const adminRole = await findAdminRole(admin.companyId);

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${adminRole.id}/users`,
      cookies: sessionCookiesFor(admin.id),
      payload: { userIds: [admin.id] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Os usuários do cargo "Administrador" não mudam por aqui: altere os cargos de cada usuário.',
    });
    expect(await memberIdsOf(adminRole.id)).toEqual([admin.id, otherAdmin.id].toSorted());
  });

  it("usuário de outra empresa ou excluído responde 404 e não altera nada", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    const member = await createUser({ companyId: admin.companyId, permissions: [] });
    const outsider = await createUser({ permissions: [] });
    const deleted = await createUser({ companyId: admin.companyId, permissions: [], deletedAt: new Date() });
    const cookies = sessionCookiesFor(admin.id);
    const url = `${ROLES_URL}/${role.id}/users`;

    const withOutsider = await app.inject({
      method: "PUT",
      url,
      cookies,
      payload: { userIds: [member.id, outsider.id] },
    });
    const withDeleted = await app.inject({
      method: "PUT",
      url,
      cookies,
      payload: { userIds: [member.id, deleted.id] },
    });

    expect(withOutsider.statusCode).toBe(404);
    expect(withOutsider.json()).toEqual({ message: "Um ou mais usuários informados não existem na base de dados." });
    expect(withDeleted.statusCode).toBe(404);
    expect(await memberIdsOf(role.id)).toEqual([]);
  });

  it("cargo de outra empresa ou excluído responde 404", async () => {
    const admin = await createUser();
    const outsider = await createRole();
    const deleted = await createRole({ companyId: admin.companyId, deletedAt: new Date() });
    const member = await createUser({ companyId: admin.companyId, permissions: [] });
    const cookies = sessionCookiesFor(admin.id);
    const payload = { userIds: [member.id] };

    const fromOtherCompany = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${outsider.id}/users`,
      cookies,
      payload,
    });
    const fromDeleted = await app.inject({ method: "PUT", url: `${ROLES_URL}/${deleted.id}/users`, cookies, payload });

    expect(fromOtherCompany.statusCode).toBe(404);
    expect(fromDeleted.statusCode).toBe(404);
    expect(await prisma.userRole.count({ where: { userId: member.id } })).toBe(0);
  });

  it("cargo excluído ao mesmo tempo que o vínculo responde 404 e não vincula", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    const member = await createUser({ companyId: admin.companyId, permissions: [] });

    const response = await raceAgainstAdminChange({
      companyId: admin.companyId,
      lockedWrite: (tx) => tx.role.update({ where: { id: role.id }, data: { deletedAt: new Date() } }),
      operation: () =>
        app.inject({
          method: "PUT",
          url: `${ROLES_URL}/${role.id}/users`,
          cookies: sessionCookiesFor(admin.id),
          payload: { userIds: [member.id] },
        }),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Cargo não existe na base de dados." });
    expect(await prisma.userRole.count({ where: { userId: member.id } })).toBe(0);
  });

  describe("anti-escalonamento: ninguém dá a alguém permissão que não possui", () => {
    it("incluir alguém num cargo com permissão fora das do autor responde 403 e não vincula", async () => {
      const actor = await createUser({ permissions: ["backoffice.roles.update", "backoffice.users.update"] });
      const role = await createRole({ companyId: actor.companyId, permissions: ["backoffice.audit.read"] });
      const member = await createUser({ companyId: actor.companyId, permissions: [] });

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}/users`,
        cookies: sessionCookiesFor(actor.id),
        payload: { userIds: [member.id] },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: GRANT_BEYOND_OWN_MESSAGE });
      expect(await memberIdsOf(role.id)).toEqual([]);
    });

    it("retirar alguém de um cargo com permissão fora das do autor é permitido", async () => {
      const actor = await createUser({ permissions: ["backoffice.roles.update", "backoffice.users.update"] });
      const role = await createRole({ companyId: actor.companyId, permissions: ["backoffice.audit.read"] });
      await createUser({ companyId: actor.companyId, roleIds: [role.id] });

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}/users`,
        cookies: sessionCookiesFor(actor.id),
        payload: { userIds: [] },
      });

      expect(response.statusCode).toBe(200);
      expect(await memberIdsOf(role.id)).toEqual([]);
    });

    it("autor com todas as permissões do cargo inclui", async () => {
      const actor = await createUser({
        permissions: ["backoffice.roles.update", "backoffice.users.update", "backoffice.audit.read"],
      });
      const role = await createRole({ companyId: actor.companyId, permissions: ["backoffice.audit.read"] });
      const member = await createUser({ companyId: actor.companyId, permissions: [] });

      const response = await app.inject({
        method: "PUT",
        url: `${ROLES_URL}/${role.id}/users`,
        cookies: sessionCookiesFor(actor.id),
        payload: { userIds: [member.id] },
      });

      expect(response.statusCode).toBe(200);
      expect(await memberIdsOf(role.id)).toEqual([member.id]);
    });
  });

  it("corpo inválido responde 400 com os campos", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });
    const cookies = sessionCookiesFor(admin.id);
    const url = `${ROLES_URL}/${role.id}/users`;

    const missing = await app.inject({ method: "PUT", url, cookies, payload: {} });
    const invalidId = await app.inject({ method: "PUT", url, cookies, payload: { userIds: ["x"] } });

    expect(missing.statusCode).toBe(400);
    expect(missing.json().issues).toEqual([{ path: "userIds", message: "Informe os usuários do cargo." }]);
    expect(invalidId.statusCode).toBe(400);
    expect(invalidId.json().issues).toEqual([{ path: "userIds.0", message: "Identificador inválido." }]);
  });

  it("mais usuários que o limite do corpo respondem 400", async () => {
    const admin = await createUser();
    const role = await createRole({ companyId: admin.companyId });

    const response = await app.inject({
      method: "PUT",
      url: `${ROLES_URL}/${role.id}/users`,
      cookies: sessionCookiesFor(admin.id),
      payload: { userIds: Array.from({ length: 1001 }, () => admin.id) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "userIds", message: "Informe no máximo 1000 usuários." }]);
  });
});

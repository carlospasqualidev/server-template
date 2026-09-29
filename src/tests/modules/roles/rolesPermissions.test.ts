import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { PERMISSION_DENIED_MESSAGE } from "@/hooks/requirePermission";
import { prisma } from "@/lib/prisma";
import { PERMISSION_NAMES, type PermissionName } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { createCompany, createRole, createUser, findPermissionIds } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ROLES_URL = "/api/client/roles";

interface ScenarioContext {
  permissionIds: string[];
  memberId: string;
}

interface RouteCase {
  route: string;
  /** Todas são exigidas: sem qualquer uma delas, 403. */
  permissions: PermissionName[];
  /** Permissões que a operação concede (anti-escalonamento): o autor do caso de sucesso também precisa delas. */
  grants?: PermissionName[];
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: (roleId: string) => string;
  payload?: (context: ScenarioContext) => Record<string, unknown>;
  successStatus: number;
}

const routeCases: RouteCase[] = [
  {
    route: "GET /roles",
    permissions: ["backoffice.roles.read"],
    method: "GET",
    url: () => ROLES_URL,
    successStatus: 200,
  },
  {
    route: "GET /roles/permissions",
    permissions: ["backoffice.roles.read"],
    method: "GET",
    url: () => `${ROLES_URL}/permissions`,
    successStatus: 200,
  },
  {
    route: "GET /roles/:roleId",
    permissions: ["backoffice.roles.read"],
    method: "GET",
    url: (roleId) => `${ROLES_URL}/${roleId}`,
    successStatus: 200,
  },
  {
    route: "POST /roles",
    permissions: ["backoffice.roles.create"],
    method: "POST",
    url: () => ROLES_URL,
    payload: ({ permissionIds }) => ({ name: "Novo cargo", permissionIds }),
    grants: ["backoffice.users.read"],
    successStatus: 201,
  },
  {
    route: "POST /roles/:roleId/copy",
    permissions: ["backoffice.roles.create"],
    method: "POST",
    url: (roleId) => `${ROLES_URL}/${roleId}/copy`,
    grants: ["backoffice.users.read"],
    successStatus: 201,
  },
  {
    route: "PUT /roles/:roleId",
    permissions: ["backoffice.roles.update"],
    method: "PUT",
    url: (roleId) => `${ROLES_URL}/${roleId}`,
    payload: ({ permissionIds }) => ({ name: "Renomeado", permissionIds }),
    successStatus: 200,
  },
  {
    route: "DELETE /roles/:roleId",
    permissions: ["backoffice.roles.delete"],
    method: "DELETE",
    url: (roleId) => `${ROLES_URL}/${roleId}`,
    successStatus: 200,
  },
  {
    route: "GET /roles/:roleId/users",
    permissions: ["backoffice.roles.read", "backoffice.users.read"],
    method: "GET",
    url: (roleId) => `${ROLES_URL}/${roleId}/users`,
    successStatus: 200,
  },
  {
    route: "PUT /roles/:roleId/users",
    permissions: ["backoffice.roles.update", "backoffice.users.update"],
    method: "PUT",
    url: (roleId) => `${ROLES_URL}/${roleId}/users`,
    payload: ({ memberId }) => ({ userIds: [memberId] }),
    grants: ["backoffice.users.read"],
    successStatus: 200,
  },
];

/** Empresa com o usuário da requisição, o cargo alvo (sem usuários) e um usuário sem cargo. */
async function createScenario(actorPermissions: readonly PermissionName[]) {
  const company = await createCompany();
  const actor = await createUser({ companyId: company.id, permissions: actorPermissions });
  const target = await createRole({ companyId: company.id, name: "Alvo", permissions: ["backoffice.users.read"] });
  const member = await createUser({ companyId: company.id, permissions: [] });
  const context: ScenarioContext = {
    permissionIds: await findPermissionIds(["backoffice.users.read"]),
    memberId: member.id,
  };

  return { company, actor, target, member, context };
}

describe("permissões das rotas de cargos", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe.each(routeCases)("$route", ({ permissions, grants = [], method, url, payload, successStatus }) => {
    it.each(permissions)("sem %s responde 403 e não altera nada", async (missing) => {
      const { company, actor, target, member, context } = await createScenario(
        PERMISSION_NAMES.filter((name) => name !== missing),
      );
      const rolesBefore = await prisma.role.count({ where: { companyId: company.id } });

      const response = await app.inject({
        method,
        url: url(target.id),
        cookies: sessionCookiesFor(actor.id),
        ...(payload && { payload: payload(context) }),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: PERMISSION_DENIED_MESSAGE });
      expect(await prisma.role.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
        name: "Alvo",
        deletedAt: null,
      });
      expect(await prisma.role.count({ where: { companyId: company.id } })).toBe(rolesBefore);
      expect(await prisma.userRole.count({ where: { userId: member.id } })).toBe(0);
    });

    it(`só com ${[...permissions, ...grants].join(" e ")} responde ${successStatus}`, async () => {
      const { actor, target, context } = await createScenario([...permissions, ...grants]);

      const response = await app.inject({
        method,
        url: url(target.id),
        cookies: sessionCookiesFor(actor.id),
        ...(payload && { payload: payload(context) }),
      });

      expect(response.statusCode).toBe(successStatus);
    });

    it("sem sessão responde 401", async () => {
      const { target, context } = await createScenario([]);

      const response = await app.inject({
        method,
        url: url(target.id),
        ...(payload && { payload: payload(context) }),
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

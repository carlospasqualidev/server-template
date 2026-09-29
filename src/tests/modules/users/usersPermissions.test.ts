import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { PERMISSION_DENIED_MESSAGE } from "@/hooks/requirePermission";
import { prisma } from "@/lib/prisma";
import { PERMISSION_NAMES, type PermissionName } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { createCompany, createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";

interface RouteCase {
  route: string;
  permission: PermissionName;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  url: (targetId: string) => string;
  payload?: Record<string, unknown>;
  successStatus: number;
}

const routeCases: RouteCase[] = [
  {
    route: "GET /users",
    permission: "backoffice.users.read",
    method: "GET",
    url: () => USERS_URL,
    successStatus: 200,
  },
  {
    route: "GET /users/:userId",
    permission: "backoffice.users.read",
    method: "GET",
    url: (targetId) => `${USERS_URL}/${targetId}`,
    successStatus: 200,
  },
  {
    route: "POST /users",
    permission: "backoffice.users.create",
    method: "POST",
    url: () => USERS_URL,
    payload: { name: "Novo", email: "novo@example.com", password: "senha-forte-1", confirmPassword: "senha-forte-1" },
    successStatus: 201,
  },
  {
    route: "PATCH /users/:userId",
    permission: "backoffice.users.update",
    method: "PATCH",
    url: (targetId) => `${USERS_URL}/${targetId}`,
    payload: { name: "Renomeado" },
    successStatus: 200,
  },
  {
    route: "DELETE /users/:userId",
    permission: "backoffice.users.delete",
    method: "DELETE",
    url: (targetId) => `${USERS_URL}/${targetId}`,
    successStatus: 200,
  },
  {
    route: "PUT /users/:userId/roles",
    permission: "backoffice.users.update",
    method: "PUT",
    url: (targetId) => `${USERS_URL}/${targetId}/roles`,
    payload: { roleIds: [] },
    successStatus: 200,
  },
];

describe("permissões das rotas de usuários", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe.each(routeCases)("$route exige $permission", ({ permission, method, url, payload, successStatus }) => {
    it("sem a permissão responde 403 e não altera nada", async () => {
      const company = await createCompany();
      const actor = await createUser({
        companyId: company.id,
        permissions: PERMISSION_NAMES.filter((name) => name !== permission),
      });
      const target = await createUser({ companyId: company.id, name: "Alvo", permissions: [] });

      const response = await app.inject({
        method,
        url: url(target.id),
        cookies: sessionCookiesFor(actor.id),
        ...(payload && { payload }),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: PERMISSION_DENIED_MESSAGE });

      const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(unchanged).toMatchObject({ name: "Alvo", deletedAt: null });
      expect(await prisma.user.count({ where: { email: "novo@example.com" } })).toBe(0);
    });

    it(`só com a permissão responde ${successStatus}`, async () => {
      const company = await createCompany();
      const actor = await createUser({ companyId: company.id, permissions: [permission] });
      const target = await createUser({ companyId: company.id, permissions: [] });

      const response = await app.inject({
        method,
        url: url(target.id),
        cookies: sessionCookiesFor(actor.id),
        ...(payload && { payload }),
      });

      expect(response.statusCode).toBe(successStatus);
    });
  });

  it("GET /users/me só exige sessão", async () => {
    const user = await createUser({ permissions: [] });

    const response = await app.inject({ method: "GET", url: `${USERS_URL}/me`, cookies: sessionCookiesFor(user.id) });

    expect(response.statusCode).toBe(200);
  });

  it("sem sessão responde 401 antes da checagem de permissão", async () => {
    const response = await app.inject({ method: "GET", url: USERS_URL });

    expect(response.statusCode).toBe(401);
  });
});

import { type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { ForbiddenError } from "@/lib/errors";
import { type PermissionName } from "@/modules/permissions/permission.catalog";

export const PERMISSION_DENIED_MESSAGE = "Você não possui permissão de acesso.";

type PermissionHook = (request: FastifyRequest) => Promise<void>;

/**
 * `preHandler` de rota protegida: exige que o usuário da sessão tenha `permission`, senão 403. Roda depois do
 * `requireSession` do grupo, sobre as permissões já carregadas em `request.user` (sem nova ida ao banco).
 *
 * @example
 * app.get("/", { schema: listUsersRouteSchema, preHandler: requirePermission("backoffice.users.read") }, listUsersController);
 */
export function requirePermission(permission: PermissionName): PermissionHook {
  return async (request) => {
    if (!getAuthenticatedUser(request).permissions.includes(permission)) {
      throw new ForbiddenError(PERMISSION_DENIED_MESSAGE);
    }
  };
}

/** Como `requirePermission`, mas basta uma das permissões (recurso compartilhado por mais de uma ação). */
export function requireAnyPermission(permissions: readonly [PermissionName, ...PermissionName[]]): PermissionHook {
  return async (request) => {
    const granted = getAuthenticatedUser(request).permissions;

    if (!permissions.some((permission) => granted.includes(permission))) {
      throw new ForbiddenError(PERMISSION_DENIED_MESSAGE);
    }
  };
}

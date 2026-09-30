import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { LOGIN_RATE_LIMIT } from "@/config/constants";
import { requirePermission } from "@/hooks/requirePermission";
import { changeCurrentUserPasswordController } from "@/modules/users/controllers/changeCurrentUserPassword.controller";
import { createUserController } from "@/modules/users/controllers/createUser.controller";
import { deleteUserController } from "@/modules/users/controllers/deleteUser.controller";
import { findCurrentUserController } from "@/modules/users/controllers/findCurrentUser.controller";
import { findCurrentUserProfileController } from "@/modules/users/controllers/findCurrentUserProfile.controller";
import { findUserByIdController } from "@/modules/users/controllers/findUserById.controller";
import { listUsersController } from "@/modules/users/controllers/listUsers.controller";
import { setUserRolesController } from "@/modules/users/controllers/setUserRoles.controller";
import { updateCurrentUserController } from "@/modules/users/controllers/updateCurrentUser.controller";
import { updateUserController } from "@/modules/users/controllers/updateUser.controller";
import { changeCurrentUserPasswordRouteSchema } from "@/modules/users/schemas/changeCurrentUserPassword.schema";
import { createUserRouteSchema } from "@/modules/users/schemas/createUser.schema";
import { deleteUserRouteSchema } from "@/modules/users/schemas/deleteUser.schema";
import { findCurrentUserRouteSchema } from "@/modules/users/schemas/findCurrentUser.schema";
import { findCurrentUserProfileRouteSchema } from "@/modules/users/schemas/findCurrentUserProfile.schema";
import { findUserByIdRouteSchema } from "@/modules/users/schemas/findUserById.schema";
import { listUsersRouteSchema } from "@/modules/users/schemas/listUsers.schema";
import { setUserRolesRouteSchema } from "@/modules/users/schemas/setUserRoles.schema";
import { updateCurrentUserRouteSchema } from "@/modules/users/schemas/updateCurrentUser.schema";
import { updateUserRouteSchema } from "@/modules/users/schemas/updateUser.schema";

export interface UsersRoutesOptions {
  /** Sobrescreve o limite de tentativas da troca de senha, o mesmo do login (usado pelos testes). */
  loginRateLimitMax?: number;
}

export const usersRoutes: FastifyPluginAsyncZod<UsersRoutesOptions> = async (app, options) => {
  // A troca de senha confere a senha atual: o mesmo limite do login, contra tentativa e erro com uma sessão alheia.
  const passwordRateLimit = {
    max: options.loginRateLimitMax ?? LOGIN_RATE_LIMIT.max,
    timeWindow: LOGIN_RATE_LIMIT.timeWindow,
  };

  app.get("/", { schema: listUsersRouteSchema, preHandler: requirePermission("backoffice.users.read"), prefixTrailingSlash: "no-slash" }, listUsersController);
  // `/me` só exige sessão: todo usuário autenticado lê e edita a si mesmo, sem permissão de administrar usuários.
  app.get("/me", { schema: findCurrentUserRouteSchema }, findCurrentUserController);
  app.get("/me/profile", { schema: findCurrentUserProfileRouteSchema }, findCurrentUserProfileController);
  app.patch("/me", { schema: updateCurrentUserRouteSchema }, updateCurrentUserController);
  app.put("/me/password", { schema: changeCurrentUserPasswordRouteSchema, config: { rateLimit: passwordRateLimit } }, changeCurrentUserPasswordController);
  app.post("/", { schema: createUserRouteSchema, preHandler: requirePermission("backoffice.users.create"), prefixTrailingSlash: "no-slash" }, createUserController);

  // Rotas com `:userId` ficam por último para não capturar `/me`.
  app.get("/:userId", { schema: findUserByIdRouteSchema, preHandler: requirePermission("backoffice.users.read") }, findUserByIdController);
  app.patch("/:userId", { schema: updateUserRouteSchema, preHandler: requirePermission("backoffice.users.update") }, updateUserController);
  app.delete("/:userId", { schema: deleteUserRouteSchema, preHandler: requirePermission("backoffice.users.delete") }, deleteUserController);
  app.put("/:userId/roles", { schema: setUserRolesRouteSchema, preHandler: requirePermission("backoffice.users.update") }, setUserRolesController);
};

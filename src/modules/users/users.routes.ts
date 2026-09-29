import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { requirePermission } from "@/hooks/requirePermission";
import { createUserController } from "@/modules/users/controllers/createUser.controller";
import { deleteUserController } from "@/modules/users/controllers/deleteUser.controller";
import { findCurrentUserController } from "@/modules/users/controllers/findCurrentUser.controller";
import { findUserByIdController } from "@/modules/users/controllers/findUserById.controller";
import { listUsersController } from "@/modules/users/controllers/listUsers.controller";
import { setUserRolesController } from "@/modules/users/controllers/setUserRoles.controller";
import { updateUserController } from "@/modules/users/controllers/updateUser.controller";
import { createUserRouteSchema } from "@/modules/users/schemas/createUser.schema";
import { deleteUserRouteSchema } from "@/modules/users/schemas/deleteUser.schema";
import { findCurrentUserRouteSchema } from "@/modules/users/schemas/findCurrentUser.schema";
import { findUserByIdRouteSchema } from "@/modules/users/schemas/findUserById.schema";
import { listUsersRouteSchema } from "@/modules/users/schemas/listUsers.schema";
import { setUserRolesRouteSchema } from "@/modules/users/schemas/setUserRoles.schema";
import { updateUserRouteSchema } from "@/modules/users/schemas/updateUser.schema";

export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { schema: listUsersRouteSchema, preHandler: requirePermission("backoffice.users.read"), prefixTrailingSlash: "no-slash" }, listUsersController);
  // `/me` só exige sessão: todo usuário autenticado lê a si mesmo.
  app.get("/me", { schema: findCurrentUserRouteSchema }, findCurrentUserController);
  app.post("/", { schema: createUserRouteSchema, preHandler: requirePermission("backoffice.users.create"), prefixTrailingSlash: "no-slash" }, createUserController);

  // Rotas com `:userId` ficam por último para não capturar `/me`.
  app.get("/:userId", { schema: findUserByIdRouteSchema, preHandler: requirePermission("backoffice.users.read") }, findUserByIdController);
  app.patch("/:userId", { schema: updateUserRouteSchema, preHandler: requirePermission("backoffice.users.update") }, updateUserController);
  app.delete("/:userId", { schema: deleteUserRouteSchema, preHandler: requirePermission("backoffice.users.delete") }, deleteUserController);
  app.put("/:userId/roles", { schema: setUserRolesRouteSchema, preHandler: requirePermission("backoffice.users.update") }, setUserRolesController);
};

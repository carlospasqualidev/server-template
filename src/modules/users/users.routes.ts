import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { createUserController } from "@/modules/users/controllers/createUser.controller";
import { deleteUserController } from "@/modules/users/controllers/deleteUser.controller";
import { findCurrentUserController } from "@/modules/users/controllers/findCurrentUser.controller";
import { findUserByIdController } from "@/modules/users/controllers/findUserById.controller";
import { listUsersController } from "@/modules/users/controllers/listUsers.controller";
import { updateUserController } from "@/modules/users/controllers/updateUser.controller";
import { createUserRouteSchema } from "@/modules/users/schemas/createUser.schema";
import { deleteUserRouteSchema } from "@/modules/users/schemas/deleteUser.schema";
import { findCurrentUserRouteSchema } from "@/modules/users/schemas/findCurrentUser.schema";
import { findUserByIdRouteSchema } from "@/modules/users/schemas/findUserById.schema";
import { listUsersRouteSchema } from "@/modules/users/schemas/listUsers.schema";
import { updateUserRouteSchema } from "@/modules/users/schemas/updateUser.schema";

export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { schema: listUsersRouteSchema, prefixTrailingSlash: "no-slash" }, listUsersController);
  app.get("/me", { schema: findCurrentUserRouteSchema }, findCurrentUserController);
  app.post("/", { schema: createUserRouteSchema, prefixTrailingSlash: "no-slash" }, createUserController);

  // Rotas com `:userId` ficam por último para não capturar `/me`.
  app.get("/:userId", { schema: findUserByIdRouteSchema }, findUserByIdController);
  app.patch("/:userId", { schema: updateUserRouteSchema }, updateUserController);
  app.delete("/:userId", { schema: deleteUserRouteSchema }, deleteUserController);
};

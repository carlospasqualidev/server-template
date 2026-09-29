import { FastifyPluginAsync } from "fastify";
import { findUserByIdController } from "./controllers/findUserById.controller";
import { findCurrentUserController } from "./controllers/findCurrentUser.controller";
import { findUserByIdRouteSchema } from "./schemas/findUserById.schema";
import { findCurrentUserRouteSchema } from "./schemas/findCurrentUser.schema";

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", { schema: findCurrentUserRouteSchema }, findCurrentUserController);

  // Rotas com :userId devem ser as últimas para evitar conflitos com outras rotas.
  app.get("/:userId", { schema: findUserByIdRouteSchema }, findUserByIdController);
};

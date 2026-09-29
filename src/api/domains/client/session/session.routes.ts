import { FastifyPluginAsync } from "fastify";
import { loginController } from "./controllers/login.controller";
import { logoutController } from "./controllers/logout.controller";
import { loginRouteSchema } from "./schemas/login.schema";
import { logoutRouteSchema } from "./schemas/logout.schema";

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", { schema: loginRouteSchema }, loginController);
  app.post("/logout", { schema: logoutRouteSchema }, logoutController);
};

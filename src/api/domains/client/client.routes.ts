import { FastifyPluginAsync } from "fastify";
import { userRoutes } from "./user/user.routes";
import { sessionRoutes } from "./session/session.routes";
import { uploadRoutes } from "./upload/upload.routes";
import { sessionMiddleware } from "../../middlewares/session/sessionMiddleware";

export const clientRoutes: FastifyPluginAsync = async (app) => {
  app.register(sessionRoutes, { prefix: "/session" });

  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", sessionMiddleware);
    protectedApp.register(userRoutes, { prefix: "/users" });
    protectedApp.register(uploadRoutes, { prefix: "/upload" });
  });
};

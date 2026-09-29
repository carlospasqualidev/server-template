import { FastifyPluginAsync } from "fastify";
import { clientRoutes } from "./domains/client/client.routes";

export const routes: FastifyPluginAsync = async (app) => {
  app.register(clientRoutes, { prefix: "/client" });
};

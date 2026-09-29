import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { getHealthController } from "@/modules/health/controllers/getHealth.controller";
import { getReadinessController } from "@/modules/health/controllers/getReadiness.controller";
import { getHealthRouteSchema } from "@/modules/health/schemas/getHealth.schema";
import { getReadinessRouteSchema } from "@/modules/health/schemas/getReadiness.schema";

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { schema: getHealthRouteSchema, prefixTrailingSlash: "no-slash" }, getHealthController);
  app.get("/ready", { schema: getReadinessRouteSchema }, getReadinessController);
};

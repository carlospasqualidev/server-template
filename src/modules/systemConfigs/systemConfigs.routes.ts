import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { requirePermission } from "@/hooks/requirePermission";
import { listSystemConfigsController } from "@/modules/systemConfigs/controllers/listSystemConfigs.controller";
import { updateSystemConfigsController } from "@/modules/systemConfigs/controllers/updateSystemConfigs.controller";
import { listSystemConfigsRouteSchema } from "@/modules/systemConfigs/schemas/listSystemConfigs.schema";
import { updateSystemConfigsRouteSchema } from "@/modules/systemConfigs/schemas/updateSystemConfigs.schema";

export const systemConfigsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { schema: listSystemConfigsRouteSchema, preHandler: requirePermission("backoffice.systemConfigs.read"), prefixTrailingSlash: "no-slash" }, listSystemConfigsController);
  // Gravação em lote: a tela salva todas as alterações de uma vez, sem gravação parcial.
  app.patch("/", { schema: updateSystemConfigsRouteSchema, preHandler: requirePermission("backoffice.systemConfigs.update"), prefixTrailingSlash: "no-slash" }, updateSystemConfigsController);
};

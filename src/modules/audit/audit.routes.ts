import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { requirePermission } from "@/hooks/requirePermission";
import { findAuditLogByIdController } from "@/modules/audit/controllers/findAuditLogById.controller";
import { listAuditLogOptionsController } from "@/modules/audit/controllers/listAuditLogOptions.controller";
import { listAuditLogsController } from "@/modules/audit/controllers/listAuditLogs.controller";
import { findAuditLogByIdRouteSchema } from "@/modules/audit/schemas/findAuditLogById.schema";
import { listAuditLogOptionsRouteSchema } from "@/modules/audit/schemas/listAuditLogOptions.schema";
import { listAuditLogsRouteSchema } from "@/modules/audit/schemas/listAuditLogs.schema";

/** Trilha de auditoria: só leitura. Os registros nascem nas mutações dos outros módulos (`recordAuditService`). */
export const auditRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { schema: listAuditLogsRouteSchema, preHandler: requirePermission("backoffice.audit.read"), prefixTrailingSlash: "no-slash" }, listAuditLogsController);
  app.get("/options", { schema: listAuditLogOptionsRouteSchema, preHandler: requirePermission("backoffice.audit.read") }, listAuditLogOptionsController);

  // Rota com `:auditLogId` por último para não capturar `/options`.
  app.get("/:auditLogId", { schema: findAuditLogByIdRouteSchema, preHandler: requirePermission("backoffice.audit.read") }, findAuditLogByIdController);
};

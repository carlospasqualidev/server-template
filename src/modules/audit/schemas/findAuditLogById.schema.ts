import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { auditLogDetailSchema, auditLogParamsSchema } from "@/modules/audit/schemas/auditLog.schemas";

export const findAuditLogByIdResponseSchema = z.object({
  auditLog: auditLogDetailSchema,
});

export const findAuditLogByIdRouteSchema = {
  tags: ["AuditLogs"],
  summary: "Busca um registro da trilha de auditoria",
  description:
    "Exige `backoffice.audit.read`. Traz o antes, o depois e o autor. Registro de outra empresa ou inexistente responde 404.",
  security: [{ cookieAuth: [] }],
  params: auditLogParamsSchema,
  response: {
    200: findAuditLogByIdResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
  },
};

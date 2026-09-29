import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";

const auditLogOptionSchema = z.object({
  value: z.string().describe("Valor gravado no registro e aceito no filtro."),
  label: z.string().describe("Rótulo pt-BR para exibir."),
});

export const listAuditLogOptionsResponseSchema = z.object({
  modules: z.array(auditLogOptionSchema).describe("Módulos (`module`)."),
  actions: z.array(auditLogOptionSchema).describe("Ações (`action`)."),
  entities: z.array(auditLogOptionSchema).describe("Entidades auditadas (`entity`)."),
});

export const listAuditLogOptionsRouteSchema = {
  tags: ["AuditLogs"],
  summary: "Opções dos filtros da trilha de auditoria",
  description:
    "Exige `backoffice.audit.read`. Módulos, ações e entidades com o rótulo pt-BR, mantidos no backend: entidade nova auditada aparece sem mudar o frontend.",
  security: [{ cookieAuth: [] }],
  response: {
    200: listAuditLogOptionsResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
  },
};

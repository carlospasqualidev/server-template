import { z } from "zod";

import { paginationQuerySchema } from "@/lib/http/pagination";
import { errorResponseSchema } from "@/lib/http/responses";
import { AUDIT_ENTITIES } from "@/modules/audit/audit.catalog";
import { auditLogTimelineItemSchema } from "@/modules/audit/schemas/auditLog.schemas";

export const listAuditLogsByEntityParamsSchema = z.object({
  entity: z
    .enum(AUDIT_ENTITIES, { message: "Entidade de auditoria inválida." })
    .describe(`Tipo do registro, nome do model: ${AUDIT_ENTITIES.join(", ")}.`),
  // Sem `max`: o roteador já recusa segmento com mais de 100 caracteres (`maxParamLength` do Fastify: 414
  // `Parâmetro da URL muito longo.`, por `frameworkErrors` em `app.ts`).
  entityId: z
    .string()
    .trim()
    .min(1, "Informe o identificador do registro.")
    .describe("Id exato do registro (a chave, no caso de configuração, ex.: `security.idleTimeoutMinutes`).")
    .meta({ examples: ["01900000-0000-7000-8000-000000000000"] }),
});

export type ListAuditLogsByEntityParams = z.infer<typeof listAuditLogsByEntityParamsSchema>;

export const listAuditLogsByEntityQuerySchema = paginationQuerySchema;

export type ListAuditLogsByEntityQuery = z.infer<typeof listAuditLogsByEntityQuerySchema>;

export const listAuditLogsByEntityResponseSchema = z.object({
  logs: z.array(auditLogTimelineItemSchema),
  count: z.number().int().describe("Total de eventos do registro (para paginação)."),
});

export const listAuditLogsByEntityRouteSchema = {
  tags: ["AuditLogs"],
  summary: "Linha do tempo de um registro na trilha de auditoria",
  description:
    "Exige `backoffice.audit.read`. Tudo o que aconteceu com um registro (um usuário, um cargo, uma configuração), mais recente primeiro (`createdAt desc`, desempate por `id`), paginado 0-based, cada evento com autor, ação, descrição e o de→para legível (`fieldChanges`). Só eventos da empresa do usuário autenticado: registro de outra empresa ou inexistente devolve a lista vazia.",
  security: [{ cookieAuth: [] }],
  params: listAuditLogsByEntityParamsSchema,
  querystring: listAuditLogsByEntityQuerySchema,
  response: {
    200: listAuditLogsByEntityResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
  },
};

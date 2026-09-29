import { z } from "zod";

import { AuditAction, AuditModule } from "@/generated/prisma/client";
import { paginationQuerySchema, sortQuerySchema } from "@/lib/http/pagination";
import { csvQuerySchema, dateTimeQuerySchema, searchQuerySchema } from "@/lib/http/query";
import { errorResponseSchema } from "@/lib/http/responses";
import { idSchema } from "@/lib/validation/schemas";
import { auditLogListItemSchema } from "@/modules/audit/schemas/auditLog.schemas";

/** Allowlist de ordenação: só estes campos chegam ao `orderBy` do Prisma. O autor não é ordenável. */
export const AUDIT_LOG_SORT_FIELDS = ["createdAt", "module", "entity", "action", "description"] as const;

export const listAuditLogsQuerySchema = paginationQuerySchema
  .extend(sortQuerySchema(AUDIT_LOG_SORT_FIELDS, { orderBy: "createdAt", order: "desc" }).shape)
  .extend({
    module: csvQuerySchema
      .pipe(z.array(z.enum(AuditModule, { message: "Módulo de auditoria inválido." })).optional())
      .describe(`Módulos, separados por vírgula: ${Object.values(AuditModule).join(", ")}.`),
    entity: csvQuerySchema.describe("Entidades, separadas por vírgula (ex.: `User,Role`)."),
    action: csvQuerySchema
      .pipe(z.array(z.enum(AuditAction, { message: "Ação de auditoria inválida." })).optional())
      .describe(`Ações, separadas por vírgula: ${Object.values(AuditAction).join(", ")}.`),
    userId: csvQuerySchema.pipe(z.array(idSchema).optional()).describe("Autores (ids), separados por vírgula."),
    entityId: z
      .string()
      .trim()
      .max(200, "O identificador do registro deve ter no máximo 200 caracteres.")
      .optional()
      .transform((value) => value || undefined)
      .describe("Id exato do registro afetado (a chave, no caso de configuração)."),
    createdFrom: dateTimeQuerySchema.describe("Início do período (inclusivo), ISO 8601 em UTC."),
    createdTo: dateTimeQuerySchema.describe("Fim do período (inclusivo), ISO 8601 em UTC."),
    search: searchQuerySchema.describe(
      "Busca na descrição, na entidade, no id do registro e no nome do autor (contém, sem diferenciar maiúsculas).",
    ),
  });

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export const listAuditLogsResponseSchema = z.object({
  logs: z.array(auditLogListItemSchema),
  count: z.number().int().describe("Total de registros que atendem ao filtro (para paginação)."),
});

export const listAuditLogsRouteSchema = {
  tags: ["AuditLogs"],
  summary: "Lista a trilha de auditoria da empresa",
  description:
    "Exige `backoffice.audit.read`. Paginação 0-based, filtros múltiplos por vírgula, período inclusivo, busca e ordenação por allowlist (padrão `createdAt desc`). Só registros da empresa do usuário autenticado.",
  security: [{ cookieAuth: [] }],
  querystring: listAuditLogsQuerySchema,
  response: {
    200: listAuditLogsResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
  },
};

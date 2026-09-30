import { z } from "zod";

import { AuditAction, AuditModule } from "@/generated/prisma/client";
import { paginationQuerySchema, sortQuerySchema } from "@/lib/http/pagination";
import { csvQuerySchema, dateTimeQuerySchema, searchQuerySchema } from "@/lib/http/query";
import { errorResponseSchema } from "@/lib/http/responses";
import { idSchema } from "@/lib/validation/schemas";
import { auditLogListItemSchema } from "@/modules/audit/schemas/auditLog.schemas";

/** Allowlist de ordenação: cada campo vira uma coluna fixa no `ORDER BY`. O autor não é ordenável. */
export const AUDIT_LOG_SORT_FIELDS = ["createdAt", "module", "entity", "action", "description"] as const;

export type AuditLogSortField = (typeof AUDIT_LOG_SORT_FIELDS)[number];

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
      "Busca por conteúdo (contém, sem diferenciar maiúsculas, texto literal: `%` e `_` não são curinga): na descrição, no id do registro, no nome do autor (também de usuário excluído), nos valores gravados em `before`/`after` (ex.: um e-mail, um nome antigo; o nome de um campo, como `email`, não casa) e na entidade, pelo nome técnico ou pelo rótulo (`usuário` traz os eventos de `User`).",
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
    "Exige `backoffice.audit.read`. Paginação 0-based, filtros múltiplos por vírgula, período inclusivo, busca por conteúdo (inclusive nos valores de antes e depois) e ordenação por allowlist (padrão `createdAt desc`). Só registros da empresa do usuário autenticado.",
  security: [{ cookieAuth: [] }],
  querystring: listAuditLogsQuerySchema,
  response: {
    200: listAuditLogsResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
  },
};

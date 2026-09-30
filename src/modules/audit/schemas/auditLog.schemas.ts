import { z } from "zod";

import { AuditAction, AuditModule } from "@/generated/prisma/client";
import { dateTimeOutputSchema } from "@/lib/http/responses";
import { idSchema } from "@/lib/validation/schemas";

export const auditLogParamsSchema = z.object({
  auditLogId: idSchema.describe("ID do registro de auditoria."),
});

export type AuditLogParams = z.infer<typeof auditLogParamsSchema>;

const auditLogBaseSchema = z.object({
  id: z.string().describe("Identificador do registro."),
  module: z.enum(AuditModule).describe("Agrupador funcional. Rótulos em `GET /audit-logs/options`."),
  entity: z
    .string()
    .describe("Tipo do registro afetado, nome do model em PascalCase (`User`, `Role`, `SystemConfig`).")
    .meta({ examples: ["User"] }),
  entityId: z.string().nullable().describe("Id do registro afetado (a chave, no caso de configuração), ou null."),
  action: z.enum(AuditAction).describe("Ação registrada. Rótulos em `GET /audit-logs/options`."),
  description: z
    .string()
    .nullable()
    .describe(
      "Resumo pt-BR no passado com o nome do registro afetado entre aspas (nome do usuário, do cargo, rótulo da configuração); nunca e-mail nem senha.",
    )
    .meta({ examples: ['Bloqueou o usuário "Maria Alves".'] }),
  changedFields: z
    .array(z.string())
    .describe("Campos alterados, para destacar no detalhe. Vazio em criação, exclusão, login e exportação."),
  userId: z.string().nullable().describe("Autor da ação; null quando foi o sistema."),
  createdAt: dateTimeOutputSchema,
});

export const auditLogListItemSchema = auditLogBaseSchema.extend({
  userName: z
    .string()
    .nullable()
    .describe("Nome do autor, lido do cadastro (o atual, inclusive de usuário excluído); null quando foi o sistema."),
});

const auditSnapshotSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable();

export const auditLogDetailSchema = auditLogBaseSchema.extend({
  before: auditSnapshotSchema.describe(
    "Estado anterior, só com valores primitivos, dados pessoais inclusive (nome, e-mail, telefone); null na criação, no login e na exportação. Senha, hash e token nunca aparecem; valor secreto de configuração aparece como `[omitido]`.",
  ),
  after: auditSnapshotSchema.describe(
    "Estado posterior, no mesmo formato; null na exclusão e no login. Na exportação, o formato e os filtros aplicados, com chave pt-BR (`formato`, `busca`...).",
  ),
  user: z
    .object({
      id: z.string().describe("Identificador do autor."),
      name: z.string().describe("Nome do autor."),
      email: z.string().describe("E-mail do autor."),
    })
    .nullable()
    .describe("Autor, lido do cadastro (inclusive de usuário excluído); null quando foi o sistema."),
});

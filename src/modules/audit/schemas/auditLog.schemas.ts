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
      "Resumo pt-BR no passado com o nome do registro afetado entre aspas (nome do usuário, do cargo, rótulo da configuração); nunca e-mail nem senha. Evento anonimizado pela retenção traz a frase genérica, sem nome (`Editou um usuário.`).",
    )
    .meta({ examples: ['Bloqueou o usuário "Maria Alves".'] }),
  changedFields: z
    .array(z.string())
    .describe("Campos alterados, para destacar no detalhe. Vazio em criação, exclusão, login e exportação."),
  userId: z
    .string()
    .nullable()
    .describe("Autor da ação; null quando foi o sistema ou quando o evento foi anonimizado."),
  createdAt: dateTimeOutputSchema,
});

export const auditLogListItemSchema = auditLogBaseSchema.extend({
  userName: z
    .string()
    .nullable()
    .describe(
      "Nome do autor, lido do cadastro (o atual, inclusive de usuário excluído); null quando foi o sistema ou o evento foi anonimizado.",
    ),
});

const auditSnapshotSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable();

export const auditFieldChangeSchema = z.object({
  field: z
    .string()
    .describe("Nome técnico do campo: chave estável para a tela, não para exibir.")
    .meta({ examples: ["isActive"] }),
  label: z
    .string()
    .describe("Rótulo pt-BR do campo, do catálogo do servidor; o nome técnico quando o campo não está nele.")
    .meta({ examples: ["Ativo"] }),
  from: z
    .string()
    .describe(
      "Valor anterior, pronto para exibir: `[Vazio]` (ausente, nulo ou vazio), `Sim`/`Não`, data `dd/mm/aaaa` ou `dd/mm/aaaa hh:mm` (UTC), número com vírgula decimal (o valor de configuração pelo tipo da chave); `[omitido]` para segredo alterado (a senha) ou valor anonimizado. Id de referência sai como está.",
    )
    .meta({ examples: ["Sim"] }),
  to: z
    .string()
    .describe("Valor posterior, no mesmo formato de `from`.")
    .meta({ examples: ["Não"] }),
});

export const auditFieldChangesSchema = z
  .array(auditFieldChangeSchema)
  .describe(
    "De→para legível, na ordem do catálogo de campos da entidade. Edição e mudança de status: os campos alterados. Criação: os campos gravados com valor, com `from` = `[Vazio]`. Exclusão: os campos do estado anterior com valor, com `to` = `[Vazio]`. Campo vazio dos dois lados não aparece. Login e exportação: vazio.",
  );

export const auditLogDetailSchema = auditLogBaseSchema.extend({
  before: auditSnapshotSchema.describe(
    "Estado anterior, só com valores primitivos, dados pessoais inclusive (nome, e-mail, telefone); null na criação, no login e na exportação. Senha, hash e token nunca aparecem; valor secreto de configuração aparece como `[omitido]`, e os dados pessoais também, depois que a retenção anonimiza o evento.",
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
    .describe(
      "Autor, lido do cadastro (inclusive de usuário excluído); null quando foi o sistema ou o evento foi anonimizado.",
    ),
  fieldChanges: auditFieldChangesSchema,
});

/** Item da linha do tempo de um registro: o da lista, com o de→para no lugar de `before`/`after`. */
export const auditLogTimelineItemSchema = auditLogListItemSchema.extend({
  fieldChanges: auditFieldChangesSchema,
});

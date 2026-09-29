import { z } from "zod";

import { MAX_BODY_IDS } from "@/config/constants";
import { dateTimeOutputSchema } from "@/lib/http/responses";
import { idSchema, nameSchema } from "@/lib/validation/schemas";

export const roleParamsSchema = z.object({
  roleId: idSchema.describe("ID do cargo."),
});

export type RoleParams = z.infer<typeof roleParamsSchema>;

const roleBaseSchema = z.object({
  id: z.string().describe("Identificador do cargo."),
  name: z.string().describe("Nome, único na empresa."),
  description: z.string().nullable().describe("Descrição, ou null."),
  isSystem: z
    .boolean()
    .describe(
      "Cargo de sistema (`Administrador`): não é editado, excluído nem copiado, e os usuários dele só mudam pelos cargos de cada usuário.",
    ),
  usersCount: z.number().int().describe("Usuários com o cargo (bloqueados contam; excluídos, não)."),
  createdAt: dateTimeOutputSchema,
  updatedAt: dateTimeOutputSchema,
});

/** Cargo na listagem. */
export const roleListItemSchema = roleBaseSchema.extend({
  permissionsCount: z.number().int().describe("Permissões do cargo."),
});

/** Cargo no detalhe e na resposta das mutations. */
export const roleSchema = roleBaseSchema.extend({
  permissions: z
    .array(z.object({ id: z.string().describe("ID da permissão."), name: z.string().describe("Nome da permissão.") }))
    .describe("Permissões do cargo, em ordem alfabética do nome."),
});

/** Forma mínima do cargo, usada nos cargos de um usuário. */
export const roleSummarySchema = z.object({
  id: z.string().describe("Identificador do cargo."),
  name: z.string().describe("Nome do cargo."),
  isSystem: z.boolean().describe("Cargo de sistema (`Administrador`)."),
});

/** Corpo de criação e edição (a edição substitui o cargo inteiro). */
export const saveRoleBodySchema = z.object({
  name: nameSchema.describe("Nome do cargo, único na empresa (inclusive entre os cargos excluídos)."),
  description: z
    .string()
    .trim()
    .max(500, "A descrição deve ter no máximo 500 caracteres.")
    .nullish()
    .describe("Descrição (vazia, null ou ausente fica sem descrição)."),
  permissionIds: z
    .array(idSchema, { message: "Informe as permissões do cargo." })
    .min(1, "Selecione ao menos uma permissão para o cargo.")
    .max(MAX_BODY_IDS, `Informe no máximo ${MAX_BODY_IDS} permissões.`)
    .describe(
      "IDs das permissões (os de `GET /roles/permissions`). Qualquer escrita de um grupo inclui, ao salvar, o `read` do mesmo grupo. Só entram permissões que o autor possui (403).",
    ),
});

export type SaveRoleBody = z.infer<typeof saveRoleBodySchema>;

export const saveRoleResponseSchema = z.object({
  message: z.string(),
  role: roleSchema,
});

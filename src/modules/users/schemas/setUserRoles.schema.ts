import { z } from "zod";

import { MAX_BODY_IDS } from "@/config/constants";
import { errorResponseSchema } from "@/lib/http/responses";
import { sessionSecurity } from "@/lib/http/security";
import { idSchema } from "@/lib/validation/schemas";
import { roleSummarySchema } from "@/modules/roles/schemas/role.schemas";
import { userParamsSchema, userSchema } from "@/modules/users/schemas/user.schemas";

export const setUserRolesBodySchema = z.object({
  roleIds: z
    .array(idSchema, { message: "Informe os cargos do usuário." })
    .max(MAX_BODY_IDS, `Informe no máximo ${MAX_BODY_IDS} cargos.`)
    .describe("Conjunto completo de cargos do usuário (substitui o atual). `[]` deixa o usuário sem cargo."),
});

export type SetUserRolesBody = z.infer<typeof setUserRolesBodySchema>;

export const userWithRolesSchema = userSchema.extend({
  roles: z.array(roleSummarySchema).describe("Cargos do usuário, em ordem alfabética."),
});

export const setUserRolesResponseSchema = z.object({
  message: z.string(),
  user: userWithRolesSchema,
});

export const setUserRolesRouteSchema = {
  tags: ["Users"],
  summary: "Define os cargos de um usuário",
  description:
    "Exige `backoffice.users.update`. Substitui os cargos do usuário. Alterar os próprios cargos ou retirar o cargo `Administrador` do último administrador ativo da empresa responde 400; atribuir cargo com permissão que o autor não possui, ou atribuir ou retirar o `Administrador` sem ser Administrador, 403; usuário ou cargo de outra empresa (ou excluído), 404.",
  security: sessionSecurity,
  params: userParamsSchema,
  body: setUserRolesBodySchema,
  response: {
    200: setUserRolesResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
  },
};

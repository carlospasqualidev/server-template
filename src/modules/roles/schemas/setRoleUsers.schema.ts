import { z } from "zod";

import { MAX_BODY_IDS } from "@/config/constants";
import { errorResponseSchema } from "@/lib/http/responses";
import { idSchema } from "@/lib/validation/schemas";
import { roleParamsSchema, saveRoleResponseSchema } from "@/modules/roles/schemas/role.schemas";

export const setRoleUsersBodySchema = z.object({
  userIds: z
    .array(idSchema, { message: "Informe os usuários do cargo." })
    .max(MAX_BODY_IDS, `Informe no máximo ${MAX_BODY_IDS} usuários.`)
    .describe(
      "Conjunto completo de usuários do cargo: quem estiver com o cargo e não vier na lista perde o cargo. `[]` esvazia o cargo.",
    ),
});

export type SetRoleUsersBody = z.infer<typeof setRoleUsersBodySchema>;

export const setRoleUsersRouteSchema = {
  tags: ["Roles"],
  summary: "Define os usuários de um cargo",
  description:
    "Exige `backoffice.roles.update` e `backoffice.users.update`. Substitui o conjunto de usuários do cargo. Incluir ou retirar a si mesmo responde 400; o cargo de sistema não muda por aqui (400: use os cargos de cada usuário). Incluir alguém num cargo com permissão que o autor não possui responde 403. Usuário de outra empresa responde 404.",
  security: [{ cookieAuth: [] }],
  params: roleParamsSchema,
  body: setRoleUsersBodySchema,
  response: {
    200: saveRoleResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
  },
};

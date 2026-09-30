import { errorResponseSchema } from "@/lib/http/responses";
import { sessionSecurity } from "@/lib/http/security";
import { roleParamsSchema, saveRoleResponseSchema } from "@/modules/roles/schemas/role.schemas";

export const copyRoleRouteSchema = {
  tags: ["Roles"],
  summary: "Copia um cargo",
  description:
    'Exige `backoffice.roles.create`. Cria um cargo com a descrição e as permissões do original, sem os usuários, com o nome `"<nome> (cópia)"` (ou `(cópia 2)`, `(cópia 3)`... quando já existe). O cargo de sistema não é copiado (400); cargo com permissão que o autor não possui, 403; sem nome de cópia livre, 409.',
  security: sessionSecurity,
  params: roleParamsSchema,
  response: {
    201: saveRoleResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
};

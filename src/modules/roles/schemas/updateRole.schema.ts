import { errorResponseSchema } from "@/lib/http/responses";
import { sessionSecurity } from "@/lib/http/security";
import { roleParamsSchema, saveRoleBodySchema, saveRoleResponseSchema } from "@/modules/roles/schemas/role.schemas";

export const updateRoleRouteSchema = {
  tags: ["Roles"],
  summary: "Edita um cargo",
  description:
    "Exige `backoffice.roles.update`. Substitui nome, descrição e o conjunto inteiro de permissões. O cargo de sistema não é editado (400); nome repetido, 409; acrescentar permissão que o autor não possui, 403 (manter ou retirar as que o cargo já tem é permitido).",
  security: sessionSecurity,
  params: roleParamsSchema,
  body: saveRoleBodySchema,
  response: {
    200: saveRoleResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
};

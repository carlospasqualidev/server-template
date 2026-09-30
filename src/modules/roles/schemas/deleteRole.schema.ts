import { errorResponseSchema, messageResponseSchema } from "@/lib/http/responses";
import { sessionSecurity } from "@/lib/http/security";
import { roleParamsSchema } from "@/modules/roles/schemas/role.schemas";

export const deleteRoleRouteSchema = {
  tags: ["Roles"],
  summary: "Exclui um cargo (exclusão lógica)",
  description:
    "Exige `backoffice.roles.delete`. Cargo de sistema ou com usuários vinculados responde 400. O nome continua reservado na empresa.",
  security: sessionSecurity,
  params: roleParamsSchema,
  response: {
    200: messageResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
  },
};

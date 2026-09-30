import { errorResponseSchema, messageResponseSchema } from "@/lib/http/responses";
import { sessionSecurity } from "@/lib/http/security";
import { userParamsSchema } from "@/modules/users/schemas/user.schemas";

export const deleteUserRouteSchema = {
  tags: ["Users"],
  summary: "Exclui um usuário (exclusão lógica)",
  description:
    "Exige `backoffice.users.delete`. Excluir o próprio usuário ou o último administrador ativo da empresa responde 400.",
  security: sessionSecurity,
  params: userParamsSchema,
  response: {
    200: messageResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
  },
};

import { errorResponseSchema, messageResponseSchema } from "@/lib/http/responses";
import { userParamsSchema } from "@/modules/users/schemas/user.schemas";

export const deleteUserRouteSchema = {
  tags: ["Users"],
  summary: "Exclui um usuário (exclusão lógica)",
  security: [{ cookieAuth: [] }],
  params: userParamsSchema,
  response: {
    200: messageResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    404: errorResponseSchema,
  },
};

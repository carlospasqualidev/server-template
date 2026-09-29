import { errorResponseSchema } from "@/lib/http/responses";
import { saveRoleBodySchema, saveRoleResponseSchema } from "@/modules/roles/schemas/role.schemas";

export const createRoleRouteSchema = {
  tags: ["Roles"],
  summary: "Cria um cargo na empresa",
  description:
    "Exige `backoffice.roles.create`. Nome repetido na empresa, inclusive de cargo excluído, responde 409; permissão inexistente, 400; permissão que o autor não possui (contando o `read` incluído pela expansão), 403.",
  security: [{ cookieAuth: [] }],
  body: saveRoleBodySchema,
  response: {
    201: saveRoleResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    409: errorResponseSchema,
  },
};

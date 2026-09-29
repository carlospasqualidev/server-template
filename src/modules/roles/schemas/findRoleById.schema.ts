import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { roleParamsSchema, roleSchema } from "@/modules/roles/schemas/role.schemas";

export const findRoleByIdResponseSchema = z.object({
  role: roleSchema,
});

export const findRoleByIdRouteSchema = {
  tags: ["Roles"],
  summary: "Busca um cargo por ID, com as permissões",
  description: "Exige `backoffice.roles.read`.",
  security: [{ cookieAuth: [] }],
  params: roleParamsSchema,
  response: {
    200: findRoleByIdResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
  },
};

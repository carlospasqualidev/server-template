import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { sessionSecurity } from "@/lib/http/security";
import { userParamsSchema, userSchema } from "@/modules/users/schemas/user.schemas";

export const findUserByIdResponseSchema = z.object({
  user: userSchema,
});

export const findUserByIdRouteSchema = {
  tags: ["Users"],
  summary: "Busca um usuário por ID",
  description: "Exige `backoffice.users.read`.",
  security: sessionSecurity,
  params: userParamsSchema,
  response: {
    200: findUserByIdResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
  },
};

import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { userSummarySchema } from "@/modules/users/schemas/user.schemas";

export const findCurrentUserResponseSchema = z.object({
  user: userSummarySchema,
});

export const findCurrentUserRouteSchema = {
  tags: ["Users"],
  summary: "Usuário da sessão atual",
  description:
    "Valida a sessão e devolve o usuário autenticado com as permissões efetivas. Só exige sessão. O frontend chama ao carregar.",
  security: [{ cookieAuth: [] }],
  response: { 200: findCurrentUserResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
};

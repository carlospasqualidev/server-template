import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { emailSchema } from "@/lib/validation/schemas";
import { sessionClientHeadersSchema, sessionTokenSchema } from "@/modules/session/schemas/session.schemas";
import { userSummarySchema } from "@/modules/users/schemas/user.schemas";

export const loginBodySchema = z.object({
  email: emailSchema.describe("E-mail cadastrado.").meta({ examples: ["admin@admin.com"] }),
  password: z
    .string({ message: "Informe a senha." })
    .min(1, "Informe a senha.")
    .describe("Senha.")
    .meta({ examples: ["123123123"] }),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const loginResponseSchema = z.object({
  success: z.literal(true),
  user: userSummarySchema,
  token: sessionTokenSchema,
});

export const loginRouteSchema = {
  tags: ["Session"],
  summary: "Autentica um usuário",
  description:
    "Valida as credenciais e devolve o usuário com as permissões efetivas. Web: grava o cookie HTTP-only de sessão, e o token não sai no corpo. App nativo (`X-Client-Type: mobile`): devolve o token no corpo e não grava o cookie. Rate limit por IP igual nos dois.",
  headers: sessionClientHeadersSchema,
  body: loginBodySchema,
  response: {
    200: loginResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    429: errorResponseSchema,
  },
};

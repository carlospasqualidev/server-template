import { z } from "zod";

import { errorResponseSchema, messageResponseSchema } from "@/lib/http/responses";
import { passwordSchema, passwordsMatch, passwordsMatchIssue } from "@/lib/validation/schemas";

export const changeCurrentUserPasswordBodySchema = z
  .object({
    currentPassword: z
      .string({ message: "Informe a senha atual." })
      .min(1, "Informe a senha atual.")
      .describe("Senha atual, conferida antes da troca."),
    password: passwordSchema.describe("Nova senha."),
    confirmPassword: z.string({ message: "Confirme a nova senha." }).describe("Confirmação da nova senha."),
  })
  .refine(passwordsMatch, passwordsMatchIssue)
  .refine(({ currentPassword, password }) => currentPassword !== password, {
    message: "A nova senha precisa ser diferente da atual.",
    path: ["password"],
  });

export type ChangeCurrentUserPasswordBody = z.infer<typeof changeCurrentUserPasswordBodySchema>;

export const changeCurrentUserPasswordRouteSchema = {
  tags: ["Users"],
  summary: "Troca a própria senha",
  description:
    "Só exige sessão. Confere a senha atual (errada responde 400 `Senha atual incorreta.`); a nova segue as regras de senha, precisa ser igual à confirmação e diferente da atual. Se a senha mudar por outro caminho entre a conferência e a gravação, responde 409 e mantém a que foi gravada. Mesmo limite de tentativas do login (429). As sessões abertas continuam válidas: o JWT não é revogado.",
  security: [{ cookieAuth: [] }],
  body: changeCurrentUserPasswordBodySchema,
  response: {
    200: messageResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    409: errorResponseSchema,
    429: errorResponseSchema,
  },
};

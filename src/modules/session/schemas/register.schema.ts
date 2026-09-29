import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { emailSchema, nameSchema, passwordSchema } from "@/lib/validation/schemas";
import { userSummarySchema } from "@/modules/users/schemas/user.schemas";

export const registerBodySchema = z.object({
  name: nameSchema.describe("Nome do usuário."),
  email: emailSchema.describe("E-mail de acesso (único)."),
  password: passwordSchema.describe("Senha."),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const registerResponseSchema = z.object({
  success: z.literal(true),
  user: userSummarySchema,
});

export const registerRouteSchema = {
  tags: ["Session"],
  summary: "Cria uma conta e inicia a sessão",
  description:
    "Cria a empresa, o cargo `Administrador` dela (catálogo inteiro de permissões) e o usuário vinculado a esse cargo, e grava o cookie de sessão.",
  body: registerBodySchema,
  response: {
    201: registerResponseSchema,
    400: errorResponseSchema,
    409: errorResponseSchema,
    429: errorResponseSchema,
  },
};

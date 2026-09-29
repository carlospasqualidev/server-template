import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import {
  nameSchema,
  passwordSchema,
  passwordsMatch,
  passwordsMatchIssue,
  phoneSchema,
  urlSchema,
} from "@/lib/validation/schemas";
import { userParamsSchema, userSchema } from "@/modules/users/schemas/user.schemas";

/** Atualização parcial: só os campos enviados mudam. `email` é identidade e não muda por aqui. */
export const updateUserBodySchema = z
  .object({
    name: nameSchema.optional().describe("Nome."),
    phone: phoneSchema.nullable().optional().describe("Telefone (null limpa)."),
    image: urlSchema.nullable().optional().describe("URL da foto (null limpa)."),
    isActive: z.boolean().optional().describe("false bloqueia o acesso."),
    password: passwordSchema.optional().describe("Nova senha."),
    confirmPassword: z.string().optional().describe("Confirmação da nova senha."),
  })
  .refine(passwordsMatch, passwordsMatchIssue);

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const updateUserResponseSchema = z.object({
  message: z.string(),
  user: userSchema,
});

export const updateUserRouteSchema = {
  tags: ["Users"],
  summary: "Atualiza um usuário",
  security: [{ cookieAuth: [] }],
  params: userParamsSchema,
  body: updateUserBodySchema,
  response: {
    200: updateUserResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    404: errorResponseSchema,
  },
};

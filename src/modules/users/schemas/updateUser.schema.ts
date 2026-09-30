import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { sessionSecurity } from "@/lib/http/security";
import {
  imageUrlSchema,
  nameSchema,
  passwordSchema,
  passwordsMatch,
  passwordsMatchIssue,
  phoneSchema,
} from "@/lib/validation/schemas";
import { idleTimeoutMinutesBodySchema, userParamsSchema, userSchema } from "@/modules/users/schemas/user.schemas";

/** Atualização parcial: só os campos enviados mudam. `email` é identidade e não muda por aqui. */
export const updateUserBodySchema = z
  .object({
    name: nameSchema.optional().describe("Nome."),
    phone: phoneSchema.nullable().optional().describe("Telefone (null limpa)."),
    image: imageUrlSchema.nullable().optional().describe("URL https da foto (null limpa)."),
    isActive: z.boolean().optional().describe("false bloqueia o acesso."),
    idleTimeoutMinutes: idleTimeoutMinutesBodySchema
      .optional()
      .describe("Tempo de inatividade próprio, em minutos (1 a 480). null volta a herdar o da empresa."),
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
  description:
    "Exige `backoffice.users.update`. Bloquear (`isActive: false`) o último administrador ativo da empresa responde 400.",
  security: sessionSecurity,
  params: userParamsSchema,
  body: updateUserBodySchema,
  response: {
    200: updateUserResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
  },
};

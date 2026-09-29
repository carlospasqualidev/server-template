import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import {
  emailSchema,
  nameSchema,
  passwordSchema,
  passwordsMatch,
  passwordsMatchIssue,
  phoneSchema,
  urlSchema,
} from "@/lib/validation/schemas";
import { idleTimeoutMinutesBodySchema, userSchema } from "@/modules/users/schemas/user.schemas";

export const createUserBodySchema = z
  .object({
    name: nameSchema.describe("Nome."),
    email: emailSchema.describe("E-mail de acesso (único)."),
    password: passwordSchema.describe("Senha."),
    confirmPassword: z.string({ message: "Confirme a senha." }).describe("Confirmação da senha."),
    phone: phoneSchema.nullish().describe("Telefone."),
    image: urlSchema.nullish().describe("URL da foto (use a rota de upload antes)."),
    idleTimeoutMinutes: idleTimeoutMinutesBodySchema
      .optional()
      .describe("Tempo de inatividade próprio, em minutos (1 a 480). Ausente ou null: herda o da empresa."),
  })
  .refine(passwordsMatch, passwordsMatchIssue);

export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const createUserResponseSchema = z.object({
  message: z.string(),
  user: userSchema,
});

export const createUserRouteSchema = {
  tags: ["Users"],
  summary: "Cria um usuário na empresa",
  description: "Exige `backoffice.users.create`. O usuário nasce sem cargo.",
  security: [{ cookieAuth: [] }],
  body: createUserBodySchema,
  response: {
    201: createUserResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    409: errorResponseSchema,
  },
};

import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { imageUrlSchema, nameSchema, phoneSchema } from "@/lib/validation/schemas";
import { idleTimeoutMinutesBodySchema, userSummarySchema } from "@/modules/users/schemas/user.schemas";

/**
 * Autoatendimento: só o que a pessoa edita no próprio perfil, parcial. Objeto estrito: e-mail (identidade), status,
 * cargos e senha (rota própria, com a senha atual) respondem 400 em vez de serem ignorados em silêncio.
 */
export const updateCurrentUserBodySchema = z.strictObject({
  name: nameSchema.optional().describe("Nome."),
  phone: phoneSchema.nullable().optional().describe("Telefone (null limpa)."),
  image: imageUrlSchema
    .nullable()
    .optional()
    .describe("URL https da foto, o `Location` devolvido por `POST /upload/file` (null remove)."),
  idleTimeoutMinutes: idleTimeoutMinutesBodySchema
    .optional()
    .describe(
      "Tempo de inatividade próprio, em minutos: de 1 até o da empresa (`security.idleTimeoutMinutes`). null volta a herdar o da empresa.",
    ),
});

export type UpdateCurrentUserBody = z.infer<typeof updateCurrentUserBodySchema>;

export const updateCurrentUserResponseSchema = z.object({
  message: z.string(),
  user: userSummarySchema,
});

export const updateCurrentUserRouteSchema = {
  tags: ["Users"],
  summary: "Atualiza o próprio perfil",
  description:
    "Só exige sessão: qualquer usuário autenticado edita o próprio nome, telefone, foto e tempo de inatividade. Não aceita `email`, `isActive`, cargos nem senha (campo fora da lista responde 400). O tempo de inatividade vai no máximo até o da empresa (`security.idleTimeoutMinutes`); acima dele responde 400 com o limite na mensagem. Devolve o usuário no formato da sessão (o mesmo de `GET /users/me`), com as permissões e o `idleTimeoutMinutes` já resolvido.",
  security: [{ cookieAuth: [] }],
  body: updateCurrentUserBodySchema,
  response: {
    200: updateCurrentUserResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
  },
};

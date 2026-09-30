import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { userSchema } from "@/modules/users/schemas/user.schemas";

/**
 * O que a pessoa edita em `PATCH /users/me`, com os valores gravados: `idleTimeoutMinutes` é o próprio (`null` herda o
 * da empresa), não o resolvido da sessão.
 */
export const currentUserProfileSchema = userSchema.pick({
  name: true,
  email: true,
  phone: true,
  image: true,
  idleTimeoutMinutes: true,
});

export const findCurrentUserProfileResponseSchema = z.object({
  profile: currentUserProfileSchema,
});

export const findCurrentUserProfileRouteSchema = {
  tags: ["Users"],
  summary: "Perfil do próprio usuário",
  description:
    "Só exige sessão. Devolve o que `PATCH /users/me` edita, com os valores gravados, para pré-preencher o formulário de perfil. Aqui `idleTimeoutMinutes` é o próprio do usuário (`null` quando herda o da empresa); na sessão (`GET /users/me`) ele sai já resolvido.",
  security: [{ cookieAuth: [] }],
  response: { 200: findCurrentUserProfileResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
};

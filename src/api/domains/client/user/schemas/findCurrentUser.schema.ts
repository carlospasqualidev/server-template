import { errorResponseSchema } from "../../../../utils/sharedSchemas/errorResponse.schema";

const findCurrentUserResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["user"],
  properties: {
    user: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "email", "username"],
      properties: {
        id: { type: "string", description: "Identificador único do usuário." },
        name: { type: "string", description: "Nome do usuário." },
        email: { type: "string", format: "email", description: "Email do usuário." },
        image: {
          anyOf: [
            { type: "string", description: "URL da imagem do usuário." },
            { type: "null", description: "Retornado quando o usuário não possui imagem." },
          ],
          description: "Imagem do usuário.",
        },
        username: { type: "string", description: "Nome de usuário." },
      },
    },
  },
  example: {
    user: {
      id: "uuid",
      name: "string",
      email: "string",
      image: "string | null",
      username: "string",
    },
  },
} as const;

export const findCurrentUserRouteSchema = {
  tags: ["Users"],
  summary: "Busca o usuário autenticado",
  description: "Retorna os dados do usuário presente no contexto da sessão.",
  security: [{ cookieAuth: [] }],
  response: {
    200: findCurrentUserResponseSchema,
    400: errorResponseSchema,
  },
} as const;

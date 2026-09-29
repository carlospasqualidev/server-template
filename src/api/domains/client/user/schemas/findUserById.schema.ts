import { errorResponseSchema } from "../../../../utils/sharedSchemas/errorResponse.schema";

const findUserByIdParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["userId"],
  properties: {
    userId: { type: "string", description: "ID do usuário buscado." },
  },
} as const;

const findUserByIdResponseSchema = {
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
        phone: {
          anyOf: [
            { type: "string", description: "Telefone do usuário." },
            { type: "null", description: "Retornado quando o usuário não possui telefone." },
          ],
          description: "Telefone do usuário.",
        },
        username: { type: "string", description: "Nome de usuário." },
      },
    },
  },
} as const;

export const findUserByIdRouteSchema = {
  tags: ["Users"],
  summary: "Busca um usuário por ID",
  description: "Retorna os dados básicos de um usuário específico.",
  security: [{ cookieAuth: [] }],
  params: findUserByIdParamsSchema,
  response: {
    200: findUserByIdResponseSchema,
    400: errorResponseSchema,
  },
} as const;

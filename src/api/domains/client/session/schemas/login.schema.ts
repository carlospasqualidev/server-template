const loginRequestBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "password"],
  properties: {
    email: {
      type: "string",
      format: "email",
      description: "Email cadastrado do usuário.",
      default: "default@example.com",
    },
    password: {
      type: "string",
      description: "Senha do usuário.",
      default: "123123123",
    },
  },
} as const;

const loginSuccessResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["success", "user"],
  properties: {
    success: { type: "boolean", description: "Indica se a autenticação foi concluída com sucesso." },
    user: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "email"],
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
      },
    },
  },
} as const;

export const loginRouteSchema = {
  tags: ["Session"],
  summary: "Autentica um usuário",
  description: "Valida credenciais e grava um cookie HTTP-only com o token JWT.",
  body: loginRequestBodySchema,
  response: {
    200: loginSuccessResponseSchema,
  },
} as const;

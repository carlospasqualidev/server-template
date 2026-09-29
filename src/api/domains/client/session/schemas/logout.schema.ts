export const logoutRouteSchema = {
  tags: ["Session"],
  summary: "Encerra a sessão atual",
  description: "Remove o cookie de autenticação do cliente.",
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["success"],
      properties: {
        success: { type: "boolean", description: "Indica se a operação de logout foi bem-sucedida." },
      },
    },
  },
} as const;

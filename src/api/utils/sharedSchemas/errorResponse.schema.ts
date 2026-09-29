export const errorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: {
    message: { type: "string", description: "Mensagem de erro retornada pela API." },
  },
} as const;

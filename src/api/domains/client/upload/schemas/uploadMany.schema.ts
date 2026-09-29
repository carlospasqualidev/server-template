import { errorResponseSchema } from "../../../../utils/sharedSchemas/errorResponse.schema";

const uploadManyRequestBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["files"],
  properties: {
    files: {
      type: "array",
      description: "Arquivos enviados no campo multipart `files`.",
      items: {
        type: "string",
        format: "binary",
      },
    },
  },
} as const;

const uploadManyResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["files"],
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fieldName", "fileName", "originalName", "mimeType", "size", "key", "url"],
        properties: {
          fieldName: { type: "string", description: "Nome do campo multipart." },
          fileName: { type: "string", description: "Nome final salvo no bucket." },
          originalName: { type: "string", description: "Nome original enviado pelo cliente." },
          mimeType: { type: "string", description: "Tipo MIME informado no upload." },
          size: { type: "number", description: "Tamanho final do arquivo em bytes." },
          key: { type: "string", description: "Chave do objeto no S3." },
          url: { type: "string", description: "URL pública do arquivo enviado." },
        },
      },
      description: "Lista dos arquivos enviados com sucesso.",
    },
  },
} as const;

export const uploadManyRouteSchema = {
  tags: ["Upload"],
  summary: "Envia múltiplos arquivos",
  description: 'Recebe arquivos via multipart/form-data no campo "files" e envia cada item para o bucket configurado.',
  security: [{ cookieAuth: [] }],
  consumes: ["multipart/form-data"],
  body: uploadManyRequestBodySchema,
  response: {
    200: uploadManyResponseSchema,
    400: errorResponseSchema,
  },
} as const;

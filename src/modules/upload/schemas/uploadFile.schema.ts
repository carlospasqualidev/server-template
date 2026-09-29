import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";

/** Só documenta o formulário no Swagger: multipart não passa pela validação Zod (ver `upload.routes.ts`). */
export const uploadFileBodySchema = z.object({
  file: z.string().meta({ format: "binary" }).describe("Arquivo enviado no campo multipart `file`."),
});

export const uploadFileResponseSchema = z.object({
  Location: z.string().describe("URL pública do arquivo. O frontend lê este campo."),
  key: z.string().describe("Chave do objeto no bucket."),
  fileName: z.string().describe("Nome salvo no bucket."),
  originalName: z.string().describe("Nome original enviado pelo cliente."),
  mimeType: z.string().describe("Tipo MIME informado no upload."),
  size: z.number().int().describe("Tamanho em bytes."),
});

export const uploadFileRouteSchema = {
  tags: ["Upload"],
  summary: "Envia um arquivo para o storage",
  description: "Recebe um arquivo via multipart/form-data no campo `file` e devolve a URL pública.",
  security: [{ cookieAuth: [] }],
  consumes: ["multipart/form-data"],
  body: uploadFileBodySchema,
  response: {
    201: uploadFileResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    413: errorResponseSchema,
    503: errorResponseSchema,
  },
};

import { z } from "zod";

/** Formato único de erro da API. O frontend exibe `message` num toast. */
export const errorResponseSchema = z.object({
  message: z.string().describe("Mensagem pronta para o usuário final, em pt-BR."),
  details: z.unknown().optional().describe("Dado extra do erro, quando houver."),
  issues: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional()
    .describe("Campos inválidos (erro de validação)."),
});

/** Resposta de mutation sem payload. O frontend mostra `message` num toast de sucesso. */
export const messageResponseSchema = z.object({
  message: z.string().describe("Confirmação pronta para o usuário final."),
});

/**
 * Campo de data em RESPOSTA: aceita o `Date` que vem do Prisma e é serializado como ISO 8601 UTC
 * (`2026-03-31T00:00:00.000Z`). Em body e query o valor chega como string: use `dateTimeSchema`.
 */
export const dateTimeOutputSchema = z.date().meta({ type: "string", format: "date-time" });

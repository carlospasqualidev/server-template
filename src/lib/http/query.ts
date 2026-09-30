import { z } from "zod";

import { dateTimeSchema } from "@/lib/validation/schemas";

/** Texto livre de busca (`?search=`). Vazio vira `undefined`. */
export const searchQuerySchema = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => value || undefined);

/**
 * Padrão de `LIKE`/`ILIKE` para "contém o termo", com `\`, `%` e `_` escapados: o termo casa como texto literal
 * (`50%` procura "50%", não "50" seguido de qualquer coisa; `_` não vale por um caractere qualquer). Só para SQL
 * tagueado, como parâmetro (`` ILIKE ${toContainsLikePattern(search)} ``); a barra é o escape padrão do Postgres.
 */
export function toContainsLikePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** Booleano em query string (`?isActive=true`). Ausente vira `undefined` (sem filtro). */
export const booleanQuerySchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

/** Lista separada por vírgula (`?status=a,b,c`), como a DataTable do frontend envia filtros múltiplos. */
export const csvQuerySchema = z
  .string()
  .optional()
  .transform((value) => {
    const items = (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return items.length > 0 ? items : undefined;
  });

/**
 * Data e hora em query (`?createdFrom=2026-09-01T03:00:00.000Z`): ISO 8601 em UTC, com `Z`, como o frontend envia as
 * bordas do período já convertidas do fuso local. Vira `Date`; ausente, `undefined` (sem filtro).
 */
export const dateTimeQuerySchema = dateTimeSchema
  .optional()
  .transform((value) => (value === undefined ? undefined : new Date(value)));

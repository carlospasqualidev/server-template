import { z } from "zod";

import { dateTimeSchema } from "@/lib/validation/schemas";

/** Texto livre de busca (`?search=`). Vazio vira `undefined`. */
export const searchQuerySchema = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => value || undefined);

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

interface DateTimeRangeFilter {
  gte?: Date;
  lte?: Date;
}

/**
 * Intervalo de datas **inclusivo nas duas pontas** para o `where` do Prisma, a partir de um par de
 * `dateTimeQuerySchema` (ex.: `createdFrom`/`createdTo`). Sem nenhuma das pontas, `undefined` (sem filtro).
 *
 * @example
 * ...(createdAt && { createdAt }) // const createdAt = toDateTimeRangeFilter(query.createdFrom, query.createdTo)
 */
export function toDateTimeRangeFilter(from: Date | undefined, to: Date | undefined): DateTimeRangeFilter | undefined {
  if (!from && !to) {
    return undefined;
  }

  return { ...(from && { gte: from }), ...(to && { lte: to }) };
}

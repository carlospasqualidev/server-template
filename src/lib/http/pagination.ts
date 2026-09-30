import { z } from "zod";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/config/constants";

/** Paginação 0-based, alinhada à DataTable do frontend (`page` começa em 0). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0).describe("Página, começando em 0."),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe(`Itens por página (máx. ${MAX_PAGE_SIZE}).`),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function toSkipTake({ page, pageSize }: PaginationQuery): { skip: number; take: number } {
  return { skip: page * pageSize, take: pageSize };
}

/**
 * Ordenação por allowlist: só os campos listados chegam ao `orderBy` do Prisma.
 * Nunca interpole o nome da coluna vindo da query sem passar por aqui.
 *
 * @example
 * const listUsersQuerySchema = paginationQuerySchema
 *   .extend(sortQuerySchema(["name", "email", "createdAt"], { orderBy: "name", order: "asc" }).shape)
 */
export function sortQuerySchema<const TField extends string>(
  fields: readonly [TField, ...TField[]],
  defaults: { orderBy: NoInfer<TField>; order: "asc" | "desc" },
) {
  return z.object({
    orderBy: z
      .enum(fields)
      .default(defaults.orderBy)
      .describe(`Campo de ordenação: ${fields.join(", ")}.`),
    order: z.enum(["asc", "desc"]).default(defaults.order).describe("Direção da ordenação."),
  });
}

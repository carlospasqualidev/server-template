import { z } from "zod";

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

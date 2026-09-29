import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

/**
 * Client único do Prisma. Só `services/` importam este módulo (regra de lint).
 * Exclusão é lógica: toda consulta de leitura filtra `deletedAt: null`.
 */
export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

/** Filtro padrão de exclusão lógica, para compor no `where`. */
export const notDeleted = { deletedAt: null } as const;

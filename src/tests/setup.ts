// Primeiro import: aponta DATABASE_URL para o banco temporário antes de `@/lib/prisma` carregar o ambiente.
import "@/tests/temporaryDatabaseEnv";

import { afterAll, beforeEach } from "vitest";

import { env } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { syncPermissionCatalogService } from "@/modules/permissions/services/syncPermissionCatalog.service";
import { assertTemporaryDatabase, databaseNameOf } from "@/tests/testDatabase";

/**
 * Cada teste começa com o banco vazio, exceto pelo catálogo de permissões, sincronizado de novo (como no seed).
 * Só trunca banco `temporary-int-*`. Tabelas novas precisam entrar nesta lista.
 */
export async function resetDatabase(): Promise<void> {
  assertTemporaryDatabase(databaseNameOf(env.DATABASE_URL));
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "system_configs", "user_roles", "role_permissions", "roles", "permissions", "users", "companies" RESTART IDENTITY CASCADE',
  );
  await syncPermissionCatalogService();
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

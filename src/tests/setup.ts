import { afterAll, beforeEach } from "vitest";

import { prisma } from "@/lib/prisma";
import { syncPermissionCatalogService } from "@/modules/permissions/services/syncPermissionCatalog.service";

/**
 * Cada teste começa com o banco vazio, exceto pelo catálogo de permissões, sincronizado de novo (como no seed).
 * Tabelas novas precisam entrar nesta lista.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "system_configs", "user_roles", "role_permissions", "roles", "permissions", "users", "companies" RESTART IDENTITY CASCADE',
  );
  await syncPermissionCatalogService();
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

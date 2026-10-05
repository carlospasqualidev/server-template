// Primeiro import: aponta DATABASE_URL para o banco temporário antes de `@/lib/prisma` carregar o ambiente.
import "@/tests/temporaryDatabaseEnv";

import { afterAll, beforeEach } from "vitest";

import { env } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { PERMISSION_CATALOG } from "@/modules/permissions/permission.catalog";
import {
  hasSameMetadata,
  syncPermissionCatalogService,
} from "@/modules/permissions/services/syncPermissionCatalog.service";
import { assertTemporaryDatabase, databaseNameOf } from "@/tests/testDatabase";

/**
 * Tabelas esvaziadas antes de cada teste, filha antes da mãe (o `DELETE` respeita as FKs). Tabela nova entra aqui;
 * esquecida, a primeira que a referencia falha o `DELETE` da mãe com erro de FK, em vez de vazar dado entre testes.
 * `permissions` fica de fora: é o catálogo, conferido por `isPermissionCatalogInSync`.
 */
const BUSINESS_TABLES = [
  "audit_logs",
  "system_configs",
  "user_roles",
  "role_permissions",
  "roles",
  "users",
  "companies",
] as const;

/**
 * `DELETE` em vez de `TRUNCATE`: com as poucas linhas que um teste cria, custa ~3 ms contra ~20 ms (o `TRUNCATE`
 * recria os arquivos de cada tabela). Um comando só, sem parâmetros: o driver `pg` manda pelo protocolo simples,
 * que aceita vários comandos e os roda numa transação implícita. Os ids são `uuid(7)`: não há sequência a reiniciar.
 */
const DELETE_BUSINESS_ROWS = BUSINESS_TABLES.map((table) => `DELETE FROM "${table}"`).join("; ");

/** `true` quando as permissões do banco são exatamente as do catálogo em código, com os mesmos metadados. */
async function isPermissionCatalogInSync(): Promise<boolean> {
  const permissions = await prisma.permission.findMany({
    select: { name: true, module: true, groupLabel: true, action: true, label: true, sortOrder: true },
  });
  const permissionByName = new Map(permissions.map((permission) => [permission.name, permission]));

  return (
    permissions.length === PERMISSION_CATALOG.length &&
    PERMISSION_CATALOG.every((definition) => {
      const current = permissionByName.get(definition.name);

      return current !== undefined && hasSameMetadata(current, definition);
    })
  );
}

/**
 * Cada teste começa com o banco vazio, exceto pelo catálogo de permissões, igual ao do código (como depois do seed).
 * O catálogo não é apagado a cada teste: ele é conferido (uma leitura) e só é refeito do zero quando diverge, no
 * primeiro teste da execução (banco recém-migrado) ou depois de um teste que o alterou de propósito (sincronização
 * com catálogo próprio, permissão criada ou apagada à mão). Só roda em banco `temporary-int-*`.
 */
export async function resetDatabase(): Promise<void> {
  assertTemporaryDatabase(databaseNameOf(env.DATABASE_URL));
  await prisma.$executeRawUnsafe(DELETE_BUSINESS_ROWS);

  if (!(await isPermissionCatalogInSync())) {
    await prisma.$executeRawUnsafe('DELETE FROM "permissions"');
    await syncPermissionCatalogService();
  }
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

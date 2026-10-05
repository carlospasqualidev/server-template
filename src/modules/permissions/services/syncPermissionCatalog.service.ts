import { notDeleted, prisma } from "@/lib/prisma";
import {
  ADMIN_ROLE,
  OBSOLETE_PERMISSION_NAMES,
  PERMISSION_CATALOG,
  type PermissionDefinition,
} from "@/modules/permissions/permission.catalog";

interface SyncPermissionCatalogInput {
  /** Padrão: `PERMISSION_CATALOG`. Os testes passam um catálogo próprio para simular uma versão nova. */
  catalog?: readonly PermissionDefinition[];
  /** Padrão: `OBSOLETE_PERMISSION_NAMES`. */
  obsoleteNames?: readonly string[];
}

interface SyncPermissionCatalogResult {
  created: string[];
  updated: string[];
  removed: number;
}

type PermissionMetadata = Omit<PermissionDefinition, "name">;

/**
 * Nome da trava consultiva do catálogo (`hashtext` dele é a chave). A sincronização a toma exclusiva
 * (`pg_advisory_xact_lock`): serializa as sincronizações no mesmo banco. Quem cria o cargo `Administrador` de uma
 * empresa nova (register) a toma compartilhada (`pg_advisory_xact_lock_shared`): espera a sincronização em andamento
 * confirmar e só então lê o catálogo, sem esperar os outros registers.
 */
export const PERMISSION_CATALOG_LOCK_NAME = "permission-catalog-sync";

/**
 * O `timeout` padrão da transação interativa (5 s) conta também a espera pela trava: a instância que aguarda outra
 * sincronizar cairia no P2028. 30 s cobrem várias instâncias subindo juntas.
 */
const SYNC_TRANSACTION_OPTIONS = { timeout: 30_000 };

function toPermissionMetadata(definition: PermissionMetadata): PermissionMetadata {
  return {
    module: definition.module,
    groupLabel: definition.groupLabel,
    action: definition.action,
    label: definition.label,
    sortOrder: definition.sortOrder,
  };
}

/** Mesmos metadados (o que a tela de cargos mostra). Também usada pelo reset dos testes para conferir o catálogo. */
export function hasSameMetadata(current: PermissionMetadata, definition: PermissionMetadata): boolean {
  return (
    current.module === definition.module &&
    current.groupLabel === definition.groupLabel &&
    current.action === definition.action &&
    current.label === definition.label &&
    current.sortOrder === definition.sortOrder
  );
}

/**
 * Leva o catálogo em código para o banco. Idempotente e aditiva, no padrão do sul-oxidos:
 * - apaga as permissões obsoletas (a cascata as tira dos cargos);
 * - cria as que faltam e concede só estas, as criadas nesta execução, ao cargo `Administrador` de cada empresa;
 * - atualiza os metadados (rótulo, grupo, ordem) das que mudaram.
 *
 * Nunca devolve a um cargo uma permissão que já existia e foi retirada dele: a composição de um cargo existente é
 * da empresa, não da sincronização.
 *
 * Roda na subida do servidor (antes do `listen`, depois do `prisma migrate deploy`), no seed e no reset dos testes (quando o catálogo do banco diverge do código).
 * Execuções simultâneas (várias instâncias subindo, seed com a suíte) se serializam pela trava consultiva do início
 * da transação: quem chega depois espera a anterior confirmar e já enxerga o que ela gravou.
 */
export async function syncPermissionCatalogService({
  catalog = PERMISSION_CATALOG,
  obsoleteNames = OBSOLETE_PERMISSION_NAMES,
}: SyncPermissionCatalogInput = {}): Promise<SyncPermissionCatalogResult> {
  return prisma.$transaction(async (tx) => {
    // `$executeRaw` porque `pg_advisory_xact_lock` devolve `void`, que o `$queryRaw` não desserializa. A trava se
    // solta sozinha no fim da transação.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${PERMISSION_CATALOG_LOCK_NAME}))`;

    const { count: removed } = await tx.permission.deleteMany({ where: { name: { in: [...obsoleteNames] } } });

    const existing = await tx.permission.findMany({
      where: { name: { in: catalog.map((definition) => definition.name) } },
      select: { name: true, module: true, groupLabel: true, action: true, label: true, sortOrder: true },
    });
    const existingByName = new Map(existing.map((permission) => [permission.name, permission]));

    const newDefinitions = catalog.filter((definition) => !existingByName.has(definition.name));
    const changedDefinitions = catalog.filter((definition) => {
      const current = existingByName.get(definition.name);

      return current !== undefined && !hasSameMetadata(current, definition);
    });

    for (const definition of changedDefinitions) {
      await tx.permission.update({ where: { name: definition.name }, data: toPermissionMetadata(definition) });
    }

    const created = newDefinitions.map((definition) => definition.name);

    if (created.length > 0) {
      await tx.permission.createMany({
        data: newDefinitions.map((definition) => ({ name: definition.name, ...toPermissionMetadata(definition) })),
        skipDuplicates: true,
      });

      const createdPermissions = await tx.permission.findMany({
        where: { name: { in: created } },
        select: { id: true },
      });
      const adminRoles = await tx.role.findMany({
        where: { name: ADMIN_ROLE.name, isSystem: true, ...notDeleted },
        select: { id: true },
      });

      await tx.rolePermission.createMany({
        data: adminRoles.flatMap((role) =>
          createdPermissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        ),
        skipDuplicates: true,
      });
    }

    return { created, updated: changedDefinitions.map((definition) => definition.name), removed };
  }, SYNC_TRANSACTION_OPTIONS);
}

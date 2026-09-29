import { prisma } from "@/lib/prisma";
import { PERMISSION_MODULES } from "@/modules/permissions/permission.catalog";

interface CatalogPermission {
  id: string;
  name: string;
  action: string;
  label: string;
}

interface CatalogGroup {
  groupLabel: string;
  permissions: CatalogPermission[];
}

interface CatalogModule {
  module: string;
  moduleLabel: string;
  groups: CatalogGroup[];
}

/** Posição do módulo na tela de cargos: a de `PERMISSION_MODULES`; módulo fora dela vai para o fim. */
function modulePosition(module: string): number {
  const index = PERMISSION_MODULES.findIndex((definition) => definition.module === module);

  return index === -1 ? PERMISSION_MODULES.length : index;
}

function moduleLabel(module: string): string {
  return PERMISSION_MODULES.find((definition) => definition.module === module)?.label ?? module;
}

/**
 * Catálogo em árvore módulo → grupo → permissões, o formato que a tela de cargos renderiza sem regra no cliente.
 * Dentro do módulo, grupos e ações seguem `sortOrder` (dezenas por grupo, unidades por ação). Lido do banco, porque o
 * cliente precisa dos `id`; o catálogo é finito e vem do código, por isso não é paginado.
 */
export async function listPermissionCatalogService(): Promise<CatalogModule[]> {
  const permissions = await prisma.permission.findMany({
    select: { id: true, name: true, module: true, groupLabel: true, action: true, label: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const modules = new Map<string, CatalogModule>();

  for (const { module, groupLabel, ...permission } of permissions) {
    let moduleNode = modules.get(module);

    if (!moduleNode) {
      moduleNode = { module, moduleLabel: moduleLabel(module), groups: [] };
      modules.set(module, moduleNode);
    }

    let group = moduleNode.groups.find((current) => current.groupLabel === groupLabel);

    if (!group) {
      group = { groupLabel, permissions: [] };
      moduleNode.groups.push(group);
    }

    group.permissions.push(permission);
  }

  return [...modules.values()].toSorted((left, right) => modulePosition(left.module) - modulePosition(right.module));
}

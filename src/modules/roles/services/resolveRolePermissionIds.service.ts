import { BadRequestError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const READ_ACTION = "read";

/**
 * Conjunto de permissões que um cargo grava a partir dos `permissionIds` recebidos: sem repetição, todos existentes
 * no catálogo (senão 400) e com a expansão automática do sul-oxidos, em que qualquer escrita de um grupo implica o
 * `read` do mesmo grupo (mesmo `module` e `groupLabel`). O backend é quem garante a regra; a tela só a espelha.
 */
export async function resolveRolePermissionIdsService(permissionIds: readonly string[]): Promise<string[]> {
  const uniqueIds = [...new Set(permissionIds)];

  const selected = await prisma.permission.findMany({
    where: { id: { in: uniqueIds } },
    select: { module: true, groupLabel: true, action: true },
  });

  if (selected.length !== uniqueIds.length) {
    throw new BadRequestError("Uma ou mais permissões informadas não existem.");
  }

  const groupsWithWrite = selected
    .filter((permission) => permission.action !== READ_ACTION)
    .map(({ module, groupLabel }) => ({ module, groupLabel }));

  if (groupsWithWrite.length === 0) {
    return uniqueIds;
  }

  const impliedReads = await prisma.permission.findMany({
    where: { action: READ_ACTION, OR: groupsWithWrite },
    select: { id: true },
  });

  return [...new Set([...uniqueIds, ...impliedReads.map((permission) => permission.id)])];
}

import { assertExists, BadRequestError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { assertCanGrantPermissionsService } from "@/modules/permissions/services/assertCanGrantPermissions.service";
import { type SaveRoleBody } from "@/modules/roles/schemas/role.schemas";
import { assertRoleNameAvailableService } from "@/modules/roles/services/assertRoleNameAvailable.service";
import { findRoleByIdService } from "@/modules/roles/services/findRoleById.service";
import { resolveRolePermissionIdsService } from "@/modules/roles/services/resolveRolePermissionIds.service";

interface UpdateRoleInput {
  companyId: string;
  /** Usuário da sessão: só acrescenta ao cargo permissões que possui. */
  actorId: string;
  roleId: string;
  data: SaveRoleBody;
}

/** Substitui nome, descrição e o conjunto inteiro de permissões do cargo, numa transação. */
export async function updateRoleService({ companyId, actorId, roleId, data }: UpdateRoleInput) {
  const role = await prisma.role.findFirst({
    where: { id: roleId, companyId, ...notDeleted },
    select: { name: true, isSystem: true },
  });

  assertExists(role, "Cargo");

  if (role.isSystem) {
    throw new BadRequestError(`O cargo "${role.name}" é do sistema e não pode ser editado.`);
  }

  await assertRoleNameAvailableService({ companyId, name: data.name, roleId });
  const permissionIds = await resolveRolePermissionIdsService(data.permissionIds);

  return prisma.$transaction(async (tx) => {
    // O cargo é gravado primeiro: a linha travada serializa edições simultâneas do mesmo cargo, e a troca das
    // permissões abaixo já enxerga o que a anterior confirmou (o conjunto final é o de uma delas, nunca a união).
    // Cargo excluído nesse meio tempo não casa com o `where` e responde 404.
    await tx.role.update({
      where: { id: roleId, ...notDeleted },
      data: { name: data.name, description: data.description || null },
      select: { id: true },
    });

    // Só o que entra no cargo é concedido: manter ou retirar uma permissão que o autor não tem é permitido.
    const kept = await tx.rolePermission.findMany({
      where: { roleId, permissionId: { in: permissionIds } },
      select: { permissionId: true },
    });
    const keptIds = new Set(kept.map((rolePermission) => rolePermission.permissionId));

    await assertCanGrantPermissionsService(
      { companyId, actorId, permissionIds: permissionIds.filter((permissionId) => !keptIds.has(permissionId)) },
      tx,
    );

    await tx.rolePermission.deleteMany({ where: { roleId, permissionId: { notIn: permissionIds } } });
    await tx.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });

    return findRoleByIdService({ companyId, roleId }, tx);
  });
}

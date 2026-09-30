import { assertExists, BadRequestError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { AUDIT_DESCRIPTIONS } from "@/modules/audit/audit.descriptions";
import { recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { assertCanGrantPermissionsService } from "@/modules/permissions/services/assertCanGrantPermissions.service";
import { toRoleAuditSnapshot } from "@/modules/roles/roles.audit";
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
    // A linha do cargo é travada primeiro (mesma força da trava do UPDATE, que não barra quem só vincula usuários):
    // edições simultâneas do mesmo cargo se serializam, a seguinte relê o que a anterior confirmou (o conjunto final é
    // o de uma delas, nunca a união) e o "antes" registrado na trilha é exato. Cargo excluído nesse meio tempo
    // responde 404.
    await tx.$queryRaw`SELECT id FROM roles WHERE id = ${roleId} FOR NO KEY UPDATE`;
    const before = await findRoleByIdService({ companyId, roleId }, tx);

    await tx.role.update({
      where: { id: roleId },
      data: { name: data.name, description: data.description || null },
      select: { id: true },
    });

    // Só o que entra no cargo é concedido: manter ou retirar uma permissão que o autor não tem é permitido.
    const currentIds = new Set(before.permissions.map((permission) => permission.id));

    await assertCanGrantPermissionsService(
      { companyId, actorId, permissionIds: permissionIds.filter((permissionId) => !currentIds.has(permissionId)) },
      tx,
    );

    await tx.rolePermission.deleteMany({ where: { roleId, permissionId: { notIn: permissionIds } } });
    await tx.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });

    const updated = await findRoleByIdService({ companyId, roleId }, tx);

    await recordAuditService(
      {
        companyId,
        module: "SECURITY",
        entity: "Role",
        entityId: roleId,
        action: "update",
        description: AUDIT_DESCRIPTIONS.Role.updated(updated.name),
        before: toRoleAuditSnapshot(before),
        after: toRoleAuditSnapshot(updated),
      },
      tx,
    );

    return updated;
  });
}

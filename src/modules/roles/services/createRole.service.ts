import { prisma } from "@/lib/prisma";
import { recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { assertCanGrantPermissionsService } from "@/modules/permissions/services/assertCanGrantPermissions.service";
import { toRoleAuditSnapshot } from "@/modules/roles/roles.audit";
import { roleDetailSelect, toRoleDetail } from "@/modules/roles/roles.select";
import { type SaveRoleBody } from "@/modules/roles/schemas/role.schemas";
import { assertRoleNameAvailableService } from "@/modules/roles/services/assertRoleNameAvailable.service";
import { resolveRolePermissionIdsService } from "@/modules/roles/services/resolveRolePermissionIds.service";

interface CreateRoleInput {
  companyId: string;
  /** Usuário da sessão: só concede ao cargo permissões que possui. */
  actorId: string;
  data: SaveRoleBody;
}

/** Cargo comum (nunca de sistema) da empresa, com as permissões já expandidas. */
export async function createRoleService({ companyId, actorId, data }: CreateRoleInput) {
  await assertRoleNameAvailableService({ companyId, name: data.name });
  const permissionIds = await resolveRolePermissionIdsService(data.permissionIds);

  return prisma.$transaction(async (tx) => {
    // O conjunto já expandido: o `read` implícito também é concedido.
    await assertCanGrantPermissionsService({ companyId, actorId, permissionIds }, tx);

    const role = toRoleDetail(
      await tx.role.create({
        data: {
          companyId,
          name: data.name,
          description: data.description || null,
          rolePermissions: { createMany: { data: permissionIds.map((permissionId) => ({ permissionId })) } },
        },
        select: roleDetailSelect(companyId),
      }),
    );

    await recordAuditService(
      {
        companyId,
        module: "SECURITY",
        entity: "Role",
        entityId: role.id,
        action: "create",
        description: "Criou um cargo",
        after: toRoleAuditSnapshot(role),
      },
      tx,
    );

    return role;
  });
}

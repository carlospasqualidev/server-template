import { type Prisma } from "@/generated/prisma/client";
import { ForbiddenError } from "@/lib/errors";
import { notDeleted } from "@/lib/prisma";
import { ADMIN_ROLE } from "@/modules/permissions/permission.catalog";
import { findEffectivePermissionsService } from "@/modules/permissions/services/findEffectivePermissions.service";

export const GRANT_BEYOND_OWN_PERMISSIONS_MESSAGE = "Você não pode conceder permissões que não possui.";

export const ADMIN_ROLE_CHANGE_MESSAGE = `Só quem tem o cargo "${ADMIN_ROLE.name}" pode atribuí-lo ou retirá-lo de alguém.`;

interface AssertCanGrantPermissionsInput {
  companyId: string;
  /** Usuário da sessão, autor da mudança. */
  actorId: string;
  /** Permissões que a mudança acrescenta a um cargo (criar, copiar, editar). */
  permissionIds?: readonly string[];
  /** Cargos que a mudança atribui a alguém: as permissões deles contam como concedidas. */
  roleIds?: readonly string[];
  /** A mudança atribui ou retira o cargo `Administrador` de alguém. */
  changesAdminRole?: boolean;
}

/**
 * Anti-escalonamento: ninguém acrescenta a um cargo, nem atribui a alguém, uma permissão que não possui, e o cargo
 * `Administrador` só é atribuído ou retirado por quem também o tem. Os dois casos respondem 403.
 *
 * Passe só o que a mudança acrescenta (continuar com o que já tem não é conceder) e chame com o `tx` da escrita, logo
 * antes dela: as permissões efetivas do autor são lidas ali, com o que já foi confirmado.
 */
export async function assertCanGrantPermissionsService(
  { companyId, actorId, permissionIds = [], roleIds = [], changesAdminRole = false }: AssertCanGrantPermissionsInput,
  tx: Prisma.TransactionClient,
): Promise<void> {
  if (changesAdminRole) {
    const actorAdminRoles = await tx.userRole.count({
      where: { userId: actorId, role: { companyId, name: ADMIN_ROLE.name, isSystem: true, ...notDeleted } },
    });

    if (actorAdminRoles === 0) {
      throw new ForbiddenError(ADMIN_ROLE_CHANGE_MESSAGE);
    }
  }

  if (permissionIds.length === 0 && roleIds.length === 0) {
    return;
  }

  const actorPermissions = await findEffectivePermissionsService({ userId: actorId, companyId }, tx);
  const beyondActor = await tx.permission.count({
    where: {
      name: { notIn: actorPermissions },
      OR: [{ id: { in: [...permissionIds] } }, { rolePermissions: { some: { roleId: { in: [...roleIds] } } } }],
    },
  });

  if (beyondActor > 0) {
    throw new ForbiddenError(GRANT_BEYOND_OWN_PERMISSIONS_MESSAGE);
  }
}

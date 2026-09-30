import { assertExists, BadRequestError, NotFoundError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { AUDIT_DESCRIPTIONS } from "@/modules/audit/audit.descriptions";
import { recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { ADMIN_ROLE } from "@/modules/permissions/permission.catalog";
import { assertCanGrantPermissionsService } from "@/modules/permissions/services/assertCanGrantPermissions.service";
import { isLastActiveAdminService } from "@/modules/permissions/services/isLastActiveAdmin.service";
import { lockCompanyAdminsService } from "@/modules/permissions/services/lockCompanyAdmins.service";
import { OWN_ROLES_CHANGE_MESSAGE } from "@/modules/roles/services/setRoleUsers.service";
import { toUserRolesAuditSnapshot } from "@/modules/users/users.audit";
import { toUserWithRoles, userWithRolesSelect } from "@/modules/users/users.select";

interface SetUserRolesInput {
  companyId: string;
  /** Usuário da sessão: não altera os próprios cargos e só atribui cargos com permissões que possui. */
  actorId: string;
  userId: string;
  roleIds: readonly string[];
}

function isAdminRole(role: { name: string; isSystem: boolean }): boolean {
  return role.isSystem && role.name === ADMIN_ROLE.name;
}

/**
 * Substitui os cargos do usuário. O usuário e os cargos são validados, o autor precisa poder conceder o que atribui,
 * o último administrador ativo é guardado e a troca é gravada numa transação só, com a trava da empresa
 * (`lockCompanyAdminsService`): quem bloqueia, exclui ou tira o cargo `Administrador` de outro administrador ao mesmo
 * tempo espera, e as checagens releem o estado confirmado.
 */
export async function setUserRolesService({ companyId, actorId, userId, roleIds }: SetUserRolesInput) {
  if (userId === actorId) {
    throw new BadRequestError(OWN_ROLES_CHANGE_MESSAGE);
  }

  const uniqueRoleIds = [...new Set(roleIds)];

  const user = await prisma.$transaction(async (tx) => {
    await lockCompanyAdminsService({ companyId }, tx);

    // Depois da trava: o usuário excluído por quem a segurava responde 404.
    const target = await tx.user.findFirst({
      where: { id: userId, companyId, ...notDeleted },
      select: {
        name: true,
        userRoles: {
          where: { role: { companyId, ...notDeleted } },
          select: { roleId: true, role: { select: { name: true, isSystem: true } } },
        },
      },
    });

    assertExists(target, "Usuário");

    const roles = await tx.role.findMany({
      where: { id: { in: uniqueRoleIds }, companyId, ...notDeleted },
      select: { name: true, isSystem: true },
    });

    if (roles.length !== uniqueRoleIds.length) {
      throw new NotFoundError("Um ou mais cargos informados não existem na base de dados.");
    }

    const currentRoleIds = new Set(target.userRoles.map((userRole) => userRole.roleId));
    const hadAdminRole = target.userRoles.some((userRole) => isAdminRole(userRole.role));
    const keepsAdminRole = roles.some(isAdminRole);

    // Só o que muda conta: continuar num cargo que já tem não é atribuição.
    await assertCanGrantPermissionsService(
      {
        companyId,
        actorId,
        roleIds: uniqueRoleIds.filter((roleId) => !currentRoleIds.has(roleId)),
        changesAdminRole: hadAdminRole !== keepsAdminRole,
      },
      tx,
    );

    if (hadAdminRole && !keepsAdminRole && (await isLastActiveAdminService({ companyId, userId }, tx))) {
      throw new BadRequestError(
        "Não é possível retirar o cargo Administrador do último administrador ativo da empresa.",
      );
    }

    await tx.userRole.deleteMany({ where: { userId, roleId: { notIn: uniqueRoleIds } } });
    await tx.userRole.createMany({
      data: uniqueRoleIds.map((roleId) => ({ userId, roleId })),
      skipDuplicates: true,
    });

    await recordAuditService(
      {
        companyId,
        module: "SECURITY",
        entity: "User",
        entityId: userId,
        action: "update",
        description: AUDIT_DESCRIPTIONS.User.rolesChanged(target.name),
        before: toUserRolesAuditSnapshot(target.userRoles.map((userRole) => userRole.role.name)),
        after: toUserRolesAuditSnapshot(roles.map((role) => role.name)),
      },
      tx,
    );

    const updated = await tx.user.findFirst({
      where: { id: userId, companyId, ...notDeleted },
      select: userWithRolesSelect(companyId),
    });

    assertExists(updated, "Usuário");

    return updated;
  });

  return toUserWithRoles(user);
}

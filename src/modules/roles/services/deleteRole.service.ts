import { assertExists, BadRequestError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { lockCompanyAdminsService } from "@/modules/permissions/services/lockCompanyAdmins.service";
import { roleMembersWhere } from "@/modules/roles/roles.select";

interface DeleteRoleInput {
  companyId: string;
  roleId: string;
}

function linkedUsersLabel(count: number): string {
  return count === 1 ? "1 usuário" : `${count} usuários`;
}

/**
 * Exclusão lógica: marca `deletedAt` e o cargo deixa de conceder permissões. O nome continua reservado na empresa.
 * Cargo de sistema ou com usuários não é excluído. A checagem e a escrita correm com a trava da empresa, a mesma de
 * quem vincula usuários a cargos: um vínculo gravado ao mesmo tempo é visto aqui e barra a exclusão.
 */
export async function deleteRoleService({ companyId, roleId }: DeleteRoleInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCompanyAdminsService({ companyId }, tx);

    const role = await tx.role.findFirst({
      where: { id: roleId, companyId, ...notDeleted },
      select: { name: true, isSystem: true, _count: { select: { userRoles: { where: roleMembersWhere(companyId) } } } },
    });

    assertExists(role, "Cargo");

    if (role.isSystem) {
      throw new BadRequestError(`O cargo "${role.name}" é do sistema e não pode ser excluído.`);
    }

    if (role._count.userRoles > 0) {
      throw new BadRequestError(
        `Este cargo está vinculado a ${linkedUsersLabel(role._count.userRoles)}. Desvincule-os antes de excluir.`,
      );
    }

    await tx.role.update({ where: { id: roleId }, data: { deletedAt: new Date() } });
    // Os vínculos que sobram são de usuários excluídos: saem junto, sem deixar vínculo com cargo excluído.
    await tx.userRole.deleteMany({ where: { roleId } });
  });
}

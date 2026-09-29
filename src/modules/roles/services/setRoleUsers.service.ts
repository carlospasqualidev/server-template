import { assertExists, BadRequestError, NotFoundError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { assertCanGrantPermissionsService } from "@/modules/permissions/services/assertCanGrantPermissions.service";
import { lockCompanyAdminsService } from "@/modules/permissions/services/lockCompanyAdmins.service";
import { roleMembersWhere } from "@/modules/roles/roles.select";
import { findRoleByIdService } from "@/modules/roles/services/findRoleById.service";

/**
 * Ninguém altera os próprios cargos, por nenhum caminho (usuários do cargo ou cargos do usuário): evita tirar o
 * próprio acesso e conceder permissões a si mesmo. Outro administrador faz isso.
 */
export const OWN_ROLES_CHANGE_MESSAGE =
  "Você não pode alterar os seus próprios cargos de acesso. Peça a outro administrador.";

interface SetRoleUsersInput {
  companyId: string;
  /** Usuário da sessão: não pode entrar nem sair do cargo por aqui, e só dá o cargo se tiver as permissões dele. */
  actorId: string;
  roleId: string;
  userIds: readonly string[];
}

/**
 * Define quem tem o cargo: quem está na lista e ainda não tem ganha o cargo; quem tem e não está na lista perde.
 * O cargo de sistema não muda por aqui (tirar um administrador passa pelos cargos do usuário, que guardam o último
 * administrador ativo). Tudo corre com a trava da empresa, a mesma da exclusão de cargo.
 */
export async function setRoleUsersService({ companyId, actorId, roleId, userIds }: SetRoleUsersInput) {
  const wanted = new Set(userIds);

  return prisma.$transaction(async (tx) => {
    await lockCompanyAdminsService({ companyId }, tx);

    const role = await tx.role.findFirst({
      where: { id: roleId, companyId, ...notDeleted },
      select: { name: true, isSystem: true },
    });

    assertExists(role, "Cargo");

    if (role.isSystem) {
      throw new BadRequestError(
        `Os usuários do cargo "${role.name}" não mudam por aqui: altere os cargos de cada usuário.`,
      );
    }

    // Só lê quem veio na lista (limitada no schema) e o autor; quem sai é apagado pelo `notIn`, sem ler o cargo inteiro.
    const members = await tx.userRole.findMany({
      where: { roleId, userId: { in: [...wanted, actorId] }, ...roleMembersWhere(companyId) },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((userRole) => userRole.userId));
    const added = [...wanted].filter((userId) => !memberIds.has(userId));
    const actorLeaves = memberIds.has(actorId) && !wanted.has(actorId);

    // Só quem entra ou sai conta: continuar num cargo que já tem (salvar a tela sem mexer em si) não é alteração.
    if (added.includes(actorId) || actorLeaves) {
      throw new BadRequestError(OWN_ROLES_CHANGE_MESSAGE);
    }

    if (added.length > 0) {
      const found = await tx.user.count({ where: { id: { in: added }, companyId, ...notDeleted } });

      if (found !== added.length) {
        throw new NotFoundError("Um ou mais usuários informados não existem na base de dados.");
      }

      await assertCanGrantPermissionsService({ companyId, actorId, roleIds: [roleId] }, tx);
      await tx.userRole.createMany({ data: added.map((userId) => ({ userId, roleId })), skipDuplicates: true });
    }

    await tx.userRole.deleteMany({ where: { roleId, userId: { notIn: [...wanted] }, ...roleMembersWhere(companyId) } });

    return findRoleByIdService({ companyId, roleId }, tx);
  });
}

import { type Prisma } from "@/generated/prisma/client";
import { assertExists, BadRequestError, NotFoundError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { AUDIT_DESCRIPTIONS } from "@/modules/audit/audit.descriptions";
import { type AuditEntry, recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { assertCanGrantPermissionsService } from "@/modules/permissions/services/assertCanGrantPermissions.service";
import { lockCompanyAdminsService } from "@/modules/permissions/services/lockCompanyAdmins.service";
import { roleMembersWhere } from "@/modules/roles/roles.select";
import { findRoleByIdService } from "@/modules/roles/services/findRoleById.service";
import { toUserRolesAuditSnapshot } from "@/modules/users/users.audit";

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
 * Nomes dos cargos (não excluídos, da empresa) de cada usuário informado; quem não tem cargo fica com lista vazia. A
 * leitura se limita aos usuários que a troca mudou.
 */
async function findRoleNamesByUser(
  tx: Prisma.TransactionClient,
  companyId: string,
  userIds: readonly string[],
): Promise<Map<string, string[]>> {
  const links = await tx.userRole.findMany({
    where: { userId: { in: [...userIds] }, role: { companyId, ...notDeleted } },
    select: { userId: true, role: { select: { name: true } } },
  });
  const namesByUser = new Map<string, string[]>(userIds.map((userId) => [userId, []]));

  for (const link of links) {
    namesByUser.get(link.userId)?.push(link.role.name);
  }

  return namesByUser;
}

interface MembershipChange {
  companyId: string;
  userId: string;
  roleNamesBefore: readonly string[];
  roleNamesAfter: readonly string[];
  description: string;
}

/** Registro de quem entrou ou saiu do cargo: o mesmo formato de `PUT /users/:userId/roles` (cargos antes e depois). */
function toMembershipAuditEntry({
  companyId,
  userId,
  roleNamesBefore,
  roleNamesAfter,
  description,
}: MembershipChange): AuditEntry {
  return {
    companyId,
    module: "SECURITY",
    entity: "User",
    entityId: userId,
    action: "update",
    description,
    before: toUserRolesAuditSnapshot(roleNamesBefore),
    after: toUserRolesAuditSnapshot(roleNamesAfter),
  };
}

/**
 * Define quem tem o cargo: quem está na lista e ainda não tem ganha o cargo; quem tem e não está na lista perde.
 * O cargo de sistema não muda por aqui (tirar um administrador passa pelos cargos do usuário, que guardam o último
 * administrador ativo). Tudo corre com a trava da empresa, a mesma da exclusão de cargo. Cada usuário que entra ou sai
 * ganha um registro na trilha de auditoria.
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

    // Só lê quem veio na lista (limitada no schema) e o autor; quem sai é apagado abaixo, sem ler o cargo inteiro.
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

    const auditEntries: AuditEntry[] = [];

    if (added.length > 0) {
      // Limitada pela lista do corpo; o nome vai para a frase da trilha. Volta na ordem do corpo (`added` segue a
      // lista), não na que o banco devolveu: os registros da trilha saem na mesma ordem a cada chamada.
      const addedUsers = (
        await tx.user.findMany({
          where: { id: { in: added }, companyId, ...notDeleted },
          select: { id: true, name: true },
        })
      ).toSorted((first, second) => added.indexOf(first.id) - added.indexOf(second.id));

      if (addedUsers.length !== added.length) {
        throw new NotFoundError("Um ou mais usuários informados não existem na base de dados.");
      }

      await assertCanGrantPermissionsService({ companyId, actorId, roleIds: [roleId] }, tx);

      const roleNamesBefore = await findRoleNamesByUser(tx, companyId, added);

      await tx.userRole.createMany({ data: added.map((userId) => ({ userId, roleId })), skipDuplicates: true });

      for (const user of addedUsers) {
        const namesBefore = roleNamesBefore.get(user.id) ?? [];

        auditEntries.push(
          toMembershipAuditEntry({
            companyId,
            userId: user.id,
            roleNamesBefore: namesBefore,
            roleNamesAfter: [...namesBefore, role.name],
            description: AUDIT_DESCRIPTIONS.User.addedToRole(user.name, role.name),
          }),
        );
      }
    }

    // Quem sai (vínculo de usuário não excluído da empresa, fora da lista) é apagado e devolvido pelo mesmo comando:
    // o `RETURNING` traz os ids e os nomes para a trilha sem uma leitura à parte do cargo inteiro. O que volta é
    // exatamente o que a escrita apagou, então o custo acompanha a mudança, não o tamanho do cargo.
    const removed = await tx.$queryRaw<{ userId: string; name: string }[]>`
      DELETE FROM user_roles AS link
      USING users AS member
      WHERE link."roleId" = ${roleId}
        AND member.id = link."userId"
        AND member."companyId" = ${companyId}
        AND member."deletedAt" IS NULL
        AND link."userId" <> ALL(${[...wanted]}::text[])
      RETURNING link."userId", member.name`;

    if (removed.length > 0) {
      const roleNamesAfter = await findRoleNamesByUser(
        tx,
        companyId,
        removed.map((link) => link.userId),
      );

      // O `RETURNING` não tem ordem garantida: por nome e id, para a trilha sair na mesma ordem a cada chamada.
      const removedInOrder = removed.toSorted(
        (first, second) => first.name.localeCompare(second.name, "pt-BR") || first.userId.localeCompare(second.userId),
      );

      for (const { userId, name } of removedInOrder) {
        const namesAfter = roleNamesAfter.get(userId) ?? [];

        auditEntries.push(
          toMembershipAuditEntry({
            companyId,
            userId,
            roleNamesBefore: [...namesAfter, role.name],
            roleNamesAfter: namesAfter,
            description: AUDIT_DESCRIPTIONS.User.removedFromRole(name, role.name),
          }),
        );
      }
    }

    await recordAuditService(auditEntries, tx);

    return findRoleByIdService({ companyId, roleId }, tx);
  });
}

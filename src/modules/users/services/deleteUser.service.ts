import { assertExists, BadRequestError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { isLastActiveAdminService } from "@/modules/permissions/services/isLastActiveAdmin.service";
import { lockCompanyAdminsService } from "@/modules/permissions/services/lockCompanyAdmins.service";
import { findUserByIdService } from "@/modules/users/services/findUserById.service";
import { userSelect } from "@/modules/users/users.select";

interface DeleteUserInput {
  companyId: string;
  userId: string;
  currentUserId: string;
}

/** Exclusão lógica: marca `deletedAt` e bloqueia o acesso. O registro continua no banco. */
export async function deleteUserService({ companyId, userId, currentUserId }: DeleteUserInput): Promise<void> {
  if (userId === currentUserId) {
    throw new BadRequestError("Você não pode excluir o próprio usuário.");
  }

  await findUserByIdService({ companyId, userId });

  await prisma.$transaction(async (tx) => {
    await lockCompanyAdminsService({ companyId }, tx);

    if (await isLastActiveAdminService({ companyId, userId }, tx)) {
      throw new BadRequestError("Não é possível excluir o último administrador ativo da empresa.");
    }

    // Linha travada antes de ler o estado anterior, como na edição: o "antes" registrado é o que foi excluído.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
    const before = await tx.user.findFirst({ where: { id: userId, companyId, ...notDeleted }, select: userSelect });

    assertExists(before, "Usuário");

    await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date(), isActive: false } });
    await recordAuditService(
      {
        companyId,
        module: "USERS",
        entity: "User",
        entityId: userId,
        action: "delete",
        description: "Excluiu um usuário",
        before,
      },
      tx,
    );
  });
}

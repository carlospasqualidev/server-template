import { BadRequestError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { isLastActiveAdminService } from "@/modules/permissions/services/isLastActiveAdmin.service";
import { lockCompanyAdminsService } from "@/modules/permissions/services/lockCompanyAdmins.service";
import { findUserByIdService } from "@/modules/users/services/findUserById.service";

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

    await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date(), isActive: false } });
  });
}

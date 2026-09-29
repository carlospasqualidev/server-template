import { BadRequestError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
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

  await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date(), isActive: false } });
}

import { type Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { BadRequestError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { isLastActiveAdminService } from "@/modules/permissions/services/isLastActiveAdmin.service";
import { lockCompanyAdminsService } from "@/modules/permissions/services/lockCompanyAdmins.service";
import { type UpdateUserBody } from "@/modules/users/schemas/updateUser.schema";
import { findUserByIdService } from "@/modules/users/services/findUserById.service";
import { userSelect } from "@/modules/users/users.select";

interface UpdateUserInput {
  companyId: string;
  userId: string;
  data: UpdateUserBody;
}

export async function updateUserService({ companyId, userId, data }: UpdateUserInput) {
  await findUserByIdService({ companyId, userId });

  // Hash calculado antes da transação: a trava dos administradores não espera o bcrypt.
  const updateData: Prisma.UserUpdateInput = {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.isActive !== undefined && { isActive: data.isActive }),
    ...(data.password !== undefined && { password: await hashPassword(data.password) }),
  };

  return prisma.$transaction(async (tx) => {
    if (data.isActive === false) {
      await lockCompanyAdminsService({ companyId }, tx);

      if (await isLastActiveAdminService({ companyId, userId }, tx)) {
        throw new BadRequestError("Não é possível bloquear o último administrador ativo da empresa.");
      }
    }

    return tx.user.update({ where: { id: userId }, data: updateData, select: userSelect });
  });
}

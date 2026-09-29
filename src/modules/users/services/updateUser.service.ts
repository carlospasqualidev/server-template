import { type Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
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

  const updateData: Prisma.UserUpdateInput = {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.isActive !== undefined && { isActive: data.isActive }),
    ...(data.password !== undefined && { password: await hashPassword(data.password) }),
  };

  return prisma.user.update({ where: { id: userId }, data: updateData, select: userSelect });
}

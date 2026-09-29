import { hashPassword } from "@/lib/auth/password";
import { ConflictError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { type CreateUserBody } from "@/modules/users/schemas/createUser.schema";
import { userSelect } from "@/modules/users/users.select";

interface CreateUserInput {
  companyId: string;
  data: CreateUserBody;
}

export async function createUserService({ companyId, data }: CreateUserInput) {
  const emailInUse = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });

  if (emailInUse) {
    throw new ConflictError("E-mail já cadastrado.");
  }

  return prisma.user.create({
    data: {
      companyId,
      name: data.name,
      email: data.email,
      password: await hashPassword(data.password),
      phone: data.phone ?? null,
      image: data.image ?? null,
    },
    select: userSelect,
  });
}

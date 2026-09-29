import { hashPassword } from "@/lib/auth/password";
import { ConflictError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { type RegisterBody } from "@/modules/session/schemas/register.schema";

export async function registerUserService({ name, email, password }: RegisterBody) {
  const emailInUse = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (emailInUse) {
    throw new ConflictError("E-mail já cadastrado.");
  }

  return prisma.user.create({
    data: {
      name,
      email,
      password: await hashPassword(password),
      company: { create: { name: `Empresa de ${name}` } },
    },
    select: { id: true, name: true, email: true, image: true },
  });
}

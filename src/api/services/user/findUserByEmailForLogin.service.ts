import { prisma } from "../../../../lib/prisma";

// apenas pro login
export async function findUserByEmailForLoginService(email: string) {
  return prisma.user.findFirst({
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      password: true,
      image: true,
    },
    where: {
      email,
      deletedAt: null,
    },
  });
}

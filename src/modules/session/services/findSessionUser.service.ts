import { notDeleted, prisma } from "@/lib/prisma";

/** Usado pelo hook `requireSession` a cada requisição autenticada. */
export async function findSessionUserService(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, ...notDeleted },
    select: { id: true, name: true, email: true, companyId: true, isActive: true },
  });
}

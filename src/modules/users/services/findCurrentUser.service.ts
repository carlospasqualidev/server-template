import { assertExists } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { userSummarySelect } from "@/modules/users/users.select";

export async function findCurrentUserService(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, ...notDeleted },
    select: userSummarySelect,
  });

  assertExists(user, "Usuário");

  return user;
}

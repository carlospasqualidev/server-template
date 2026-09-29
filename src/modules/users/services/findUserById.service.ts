import { assertExists } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { userSelect } from "@/modules/users/users.select";

interface FindUserByIdInput {
  companyId: string;
  userId: string;
}

/** Usuário de outra empresa responde 404, nunca 403: não revelamos que o registro existe. */
export async function findUserByIdService({ companyId, userId }: FindUserByIdInput) {
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId, ...notDeleted },
    select: userSelect,
  });

  assertExists(user, "Usuário");

  return user;
}

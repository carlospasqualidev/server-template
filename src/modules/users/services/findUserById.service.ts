import { assertExists } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { toUserWithRoles, userCrudSelect } from "@/modules/users/users.select";

interface FindUserByIdInput {
  companyId: string;
  userId: string;
}

/** Usuário de outra empresa responde 404, nunca 403: não revelamos que o registro existe. */
export async function findUserByIdService({ companyId, userId }: FindUserByIdInput) {
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId, ...notDeleted },
    select: userCrudSelect(companyId),
  });

  assertExists(user, "Usuário");

  return toUserWithRoles(user);
}

import { verifyPassword } from "@/lib/auth/password";
import { assertExists, BadRequestError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { updateUserService } from "@/modules/users/services/updateUser.service";

interface ChangeCurrentUserPasswordInput {
  companyId: string;
  /** O usuário da sessão: ninguém troca a senha de outro por aqui. */
  userId: string;
  currentPassword: string;
  password: string;
}

/**
 * Troca da própria senha: confere a atual e grava a nova pela mesma edição de `PATCH /users/:userId`, que registra a
 * trilha com `password` só como campo alterado, sem valor. A conferência (bcrypt) fica fora da transação; dentro dela,
 * com a linha travada, a nova só é gravada se o hash ainda for o conferido (senão 409). Não revoga sessões: o JWT é
 * stateless (não há tabela de sessões), então os cookies já emitidos, inclusive o de outro aparelho, valem até expirar.
 */
export async function changeCurrentUserPasswordService({
  companyId,
  userId,
  currentPassword,
  password,
}: ChangeCurrentUserPasswordInput) {
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId, ...notDeleted },
    select: { password: true },
  });

  assertExists(user, "Usuário");

  if (!(await verifyPassword(currentPassword, user.password))) {
    throw new BadRequestError("Senha atual incorreta.");
  }

  await updateUserService({ companyId, userId, data: { password }, expectedPasswordHash: user.password });
}

import { type Prisma } from "@/generated/prisma/client";

interface RecordLastLoginInput {
  companyId: string;
  userId: string;
}

/**
 * Grava o último acesso (`User.lastLoginAt`) de quem acabou de abrir a sessão (login bem-sucedido e register), pelo `tx`
 * do registro na trilha: os dois confirmam ou desfazem juntos. Escopado pela empresa e pela exclusão lógica, como toda
 * escrita de dado de negócio: usuário excluído não é tocado.
 *
 * SQL tagueado em vez de `tx.user.update`: o `@updatedAt` do Prisma marcaria a linha, e o `updatedAt` do usuário
 * reflete só edição de cadastro. A data vai como parâmetro, não `now()`: a coluna é `TIMESTAMP(3)` sem fuso, o adapter
 * grava o `Date` em UTC e o `now()` gravaria no fuso da sessão do banco.
 */
export async function recordLastLoginService(
  { companyId, userId }: RecordLastLoginInput,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE users SET "lastLoginAt" = ${new Date()}
    WHERE id = ${userId} AND "companyId" = ${companyId} AND "deletedAt" IS NULL
  `;
}

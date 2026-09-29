import { type Prisma } from "@/generated/prisma/client";

interface LockCompanyAdminsInput {
  companyId: string;
}

/**
 * Trava a linha da empresa até o fim da transação e serializa quem pode reduzir o conjunto de administradores ativos
 * dela (bloquear, excluir, tirar o cargo `Administrador`). Sem a trava, duas requisições simultâneas enxergam, cada
 * uma, o outro administrador ainda ativo e juntas deixam a empresa sem nenhum.
 *
 * Primeiro comando de `prisma.$transaction(async (tx) => ...)`, antes de `isLastActiveAdminService(..., tx)` e da
 * escrita no mesmo `tx`: fora de transação a trava se solta na hora. Quem espera relê o estado já gravado por quem
 * travou antes (cada comando do READ COMMITTED lê o que já foi confirmado).
 *
 * `FOR NO KEY UPDATE` não conflita com o `FOR KEY SHARE` que a FK toma ao inserir usuário ou cargo na empresa: só
 * espera quem trava do mesmo jeito (ou altera a própria linha da empresa).
 */
export async function lockCompanyAdminsService(
  { companyId }: LockCompanyAdminsInput,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR NO KEY UPDATE`;
}

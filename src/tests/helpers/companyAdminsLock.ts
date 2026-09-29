import { setTimeout as sleep } from "node:timers/promises";

import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockCompanyAdminsService } from "@/modules/permissions/services/lockCompanyAdmins.service";

/** Vantagem dada à operação testada: tempo de sobra para, sem a trava, ela passar pela checagem e gravar. */
const HEAD_START_MS = 200;

interface RaceAgainstAdminChangeInput<T> {
  companyId: string;
  /** Escrita da outra operação (ex.: bloquear o outro administrador), gravada com a trava na mão. */
  lockedWrite: (tx: Prisma.TransactionClient) => Promise<unknown>;
  /** Operação testada (a requisição), disparada enquanto a outra segura a trava. */
  operation: () => Promise<T>;
}

/**
 * Reproduz de forma determinística a corrida do último administrador: uma transação trava os administradores da
 * empresa (`lockCompanyAdminsService`), dispara `operation`, espera `HEAD_START_MS`, grava `lockedWrite` e confirma.
 * Com a trava, `operation` espera e relê o estado já confirmado; sem ela, faria a checagem antes da outra escrita.
 * Devolve o resultado de `operation`.
 */
export async function raceAgainstAdminChange<T>({
  companyId,
  lockedWrite,
  operation,
}: RaceAgainstAdminChangeInput<T>): Promise<T> {
  let onLocked: () => void = () => undefined;
  const locked = new Promise<void>((resolve) => {
    onLocked = resolve;
  });

  const holder = prisma.$transaction(async (tx) => {
    await lockCompanyAdminsService({ companyId }, tx);
    onLocked();
    await sleep(HEAD_START_MS);
    await lockedWrite(tx);
  });

  await locked;
  const result = operation();
  await holder;

  return result;
}

import { setTimeout as sleep } from "node:timers/promises";

import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { systemConfigsLockName } from "@/modules/systemConfigs/services/updateSystemConfigs.service";

/** Vantagem dada à operação testada: tempo de sobra para, sem a trava, ela ler o "antes" antes da confirmação. */
const HEAD_START_MS = 200;

interface RaceAgainstSystemConfigsBatchInput<T> {
  companyId: string;
  /** O que o outro lote grava (ex.: `upsert` de uma chave), com a trava da empresa na mão. */
  lockedWrite: (tx: Prisma.TransactionClient) => Promise<unknown>;
  /** Operação testada (a requisição), disparada com o outro lote gravado e ainda não confirmado. */
  operation: () => Promise<T>;
}

/**
 * Reproduz de forma determinística dois lotes de configuração simultâneos da mesma empresa: uma transação toma a trava
 * consultiva dos lotes (a mesma de `updateSystemConfigsService`), grava `lockedWrite`, dispara `operation`, espera
 * `HEAD_START_MS` e confirma. Com a trava, `operation` espera e lê como "antes" o valor já confirmado; sem ela, leria o
 * valor anterior ao outro lote e a trilha registraria um "antes" que não existia mais. Devolve o resultado de
 * `operation`; falha da transação que segura a trava, ou da operação, rejeita a chamada.
 */
export async function raceAgainstSystemConfigsBatch<T>({
  companyId,
  lockedWrite,
  operation,
}: RaceAgainstSystemConfigsBatchInput<T>): Promise<T> {
  let onWritten: () => void = () => undefined;
  const written = new Promise<void>((resolve) => {
    onWritten = resolve;
  });

  const holder = prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${systemConfigsLockName(companyId)}))`;
    await lockedWrite(tx);
    onWritten();
    await sleep(HEAD_START_MS);
  });

  // `race` com `holder`: se a transação falhar antes de gravar, a chamada rejeita em vez de esperar para sempre.
  await Promise.race([written, holder]);
  const [result] = await Promise.all([operation(), holder]);

  return result;
}

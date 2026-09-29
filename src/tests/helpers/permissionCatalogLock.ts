import { setTimeout as sleep } from "node:timers/promises";

import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { PERMISSION_CATALOG_LOCK_NAME } from "@/modules/permissions/services/syncPermissionCatalog.service";

/** Vantagem dada à operação testada: tempo de sobra para, sem a trava, ela ler o catálogo antes da confirmação. */
const HEAD_START_MS = 200;

interface RaceAgainstCatalogSyncInput<T> {
  /** O que a sincronização grava (criar e apagar permissões), com a trava exclusiva do catálogo na mão. */
  syncWrite: (tx: Prisma.TransactionClient) => Promise<unknown>;
  /** Operação testada (a requisição), disparada com a sincronização gravada e ainda não confirmada. */
  operation: () => Promise<T>;
}

/**
 * Reproduz de forma determinística uma sincronização do catálogo em andamento: uma transação toma a trava exclusiva
 * do catálogo (a mesma de `syncPermissionCatalogService`), grava `syncWrite`, dispara `operation`, espera
 * `HEAD_START_MS` e confirma. Com a trava compartilhada, `operation` espera e lê o catálogo já confirmado; sem ela,
 * leria o catálogo antigo no meio da sincronização. Devolve o resultado de `operation`.
 */
export async function raceAgainstCatalogSync<T>({ syncWrite, operation }: RaceAgainstCatalogSyncInput<T>): Promise<T> {
  let onWritten: () => void = () => undefined;
  const written = new Promise<void>((resolve) => {
    onWritten = resolve;
  });

  const holder = prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${PERMISSION_CATALOG_LOCK_NAME}))`;
    await syncWrite(tx);
    onWritten();
    await sleep(HEAD_START_MS);
  });

  await Promise.race([written, holder]);
  const [result] = await Promise.all([operation(), holder]);

  return result;
}

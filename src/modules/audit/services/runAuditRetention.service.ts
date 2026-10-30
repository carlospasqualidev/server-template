import {
  AUDIT_RETENTION_BATCH_SIZE,
  AUDIT_RETENTION_LOCK_MARGIN_MS,
  AUDIT_RETENTION_TIME_LIMIT_MS,
} from "@/config/constants";
import { auditRetentionCutoff } from "@/lib/audit/auditRetention";
import { prisma } from "@/lib/prisma";
import { anonymizeAuditLogsService } from "@/modules/audit/services/anonymizeAuditLogs.service";
import { getSystemConfigValueService } from "@/modules/systemConfigs/services/getSystemConfigValue.service";

/**
 * Nome da trava consultiva da retenção (`hashtext` dele é a chave): uma execução por vez no banco, entre instâncias e
 * com o `pnpm run audit:retention`. Exportado para o teste tomar a mesma trava.
 */
export const AUDIT_RETENTION_LOCK_NAME = "audit-retention";

/** Por que uma execução parou antes de percorrer tudo: passou do tempo de trabalho, ou o encerramento pediu. */
export type AuditRetentionInterruption = "timeLimit" | "aborted";

interface RunAuditRetentionInput {
  /** Referência dos prazos: sai o evento com `createdAt` anterior a `now` menos o prazo. Vai também em `anonymizedAt`. */
  now: Date;
  /** Eventos por comando e empresas por página. Padrão: `AUDIT_RETENTION_BATCH_SIZE`. */
  batchSize?: number;
  /**
   * Tempo de trabalho, em ms: passado ele, a execução para no próximo intervalo entre dois lotes. Padrão:
   * `AUDIT_RETENTION_TIME_LIMIT_MS`. Mesmo vencido, o primeiro lote roda: toda execução avança.
   */
  timeLimitMs?: number;
  /** Pedido de parada (o encerramento do servidor): a execução para no próximo intervalo entre dois lotes. */
  signal?: AbortSignal;
}

export interface AuditRetentionResult {
  /** Outra execução estava com a trava: esta não fez nada. */
  skipped: boolean;
  /** Empresas percorridas (a interrompida no meio conta). */
  companies: number;
  /** Eventos anonimizados nesta execução. */
  anonymized: number;
  /** Eventos apagados nesta execução. */
  deleted: number;
  /**
   * `null` quando a execução percorreu tudo. Senão, por que parou antes, no intervalo entre dois lotes: `"timeLimit"`
   * (passou do tempo de trabalho) ou `"aborted"` (o encerramento do servidor pediu). O que foi feito fica, e a
   * próxima execução continua de onde esta parou.
   */
  interrupted: AuditRetentionInterruption | null;
}

/** Diz, entre dois lotes, se a execução deve parar ali. */
type ShouldStop = () => boolean;

/** Apaga, em lotes, os eventos da empresa criados antes do corte. Devolve quantos apagou. */
async function deleteAuditLogsCreatedBefore(
  companyId: string,
  cutoff: Date,
  batchSize: number,
  shouldStop: ShouldStop,
): Promise<number> {
  let deleted = 0;
  let batchDeleted: number;

  do {
    // Pelo índice `[companyId, createdAt]`. `LIMIT` na subconsulta: o `DELETE` do Postgres não aceita `LIMIT`.
    batchDeleted = await prisma.$executeRaw`
      DELETE FROM audit_logs
      WHERE id IN (
        SELECT id FROM audit_logs
        WHERE "companyId" = ${companyId} AND "createdAt" < ${cutoff}
        LIMIT ${batchSize}
      )`;
    deleted += batchDeleted;
  } while (batchDeleted === batchSize && !shouldStop());

  return deleted;
}

/** Aplica os dois prazos da empresa: primeiro apaga (o que vai sumir não precisa ser anonimizado), depois anonimiza. */
async function applyCompanyRetention(companyId: string, now: Date, batchSize: number, shouldStop: ShouldStop) {
  const anonymizeAfterMonths = await getSystemConfigValueService({ companyId, key: "audit.anonymizeAfterMonths" });
  const deleteAfterMonths = await getSystemConfigValueService({ companyId, key: "audit.deleteAfterMonths" });

  const deleted = await deleteAuditLogsCreatedBefore(
    companyId,
    auditRetentionCutoff(now, deleteAfterMonths),
    batchSize,
    shouldStop,
  );

  if (shouldStop()) {
    return { anonymized: 0, deleted };
  }

  const anonymized = await anonymizeAuditLogsService({
    where: { companyId, createdAt: { lt: auditRetentionCutoff(now, anonymizeAfterMonths) } },
    anonymizedAt: now,
    batchSize,
    shouldStop,
  });

  return { anonymized, deleted };
}

/** O motivo para parar agora, ou `null` para seguir. O pedido de parada vem antes do tempo. */
function interruptionOf(signal: AbortSignal | undefined, deadline: number): AuditRetentionInterruption | null {
  if (signal?.aborted) {
    return "aborted";
  }

  return performance.now() >= deadline ? "timeLimit" : null;
}

/**
 * Retenção da trilha de auditoria, empresa por empresa, com os prazos de cada uma (`audit.anonymizeAfterMonths` e
 * `audit.deleteAfterMonths` nas configurações, meses do calendário contados de `now`): apaga os eventos mais velhos que
 * o segundo prazo e anonimiza os mais velhos que o primeiro (`anonymizeAuditLogsService`). Toda empresa entra, também a
 * excluída, porque a trilha dela continua no banco.
 *
 * Uma execução por vez: a transação da execução começa com `pg_try_advisory_xact_lock` e a segura até o fim; quem
 * chega com ela tomada (outra instância, o script) volta na hora com `skipped` e nada feito, em vez de esperar para
 * refazer uma varredura vazia. O trabalho não é feito dentro dessa transação: cada lote é um comando no client comum,
 * que confirma sozinho, então o que foi feito fica mesmo se a execução cair no meio, e a próxima continua dali.
 *
 * Entre dois lotes (e entre duas empresas), a execução confere o tempo de trabalho (`timeLimitMs`) e o `signal`:
 * vencido um ou acionado o outro, para ali e devolve as contagens do que fez, com o motivo em `interrupted`. O
 * `timeout` da transação da trava é o tempo de trabalho mais uma folga (`AUDIT_RETENTION_LOCK_MARGIN_MS`): a execução
 * para com a trava na mão, em vez de seguir sem ela depois que o Prisma encerra a transação.
 */
export async function runAuditRetentionService({
  now,
  batchSize = AUDIT_RETENTION_BATCH_SIZE,
  timeLimitMs = AUDIT_RETENTION_TIME_LIMIT_MS,
  signal,
}: RunAuditRetentionInput): Promise<AuditRetentionResult> {
  const deadline = performance.now() + timeLimitMs;

  return prisma.$transaction(
    async (lockTx) => {
      const [lock] = await lockTx.$queryRaw<[{ acquired: boolean }]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${AUDIT_RETENTION_LOCK_NAME})) AS acquired`;

      if (!lock.acquired) {
        return { skipped: true, companies: 0, anonymized: 0, deleted: 0, interrupted: null };
      }

      const result: AuditRetentionResult = {
        skipped: false,
        companies: 0,
        anonymized: 0,
        deleted: 0,
        interrupted: null,
      };
      // O primeiro motivo encontrado fica: dali em diante, todo intervalo entre lotes para.
      const shouldStop: ShouldStop = () => {
        result.interrupted ??= interruptionOf(signal, deadline);

        return result.interrupted !== null;
      };
      let afterCompanyId: string | undefined;
      let companies: { id: string }[];

      // Empresas em páginas pelo id (cursor), sem ler a tabela inteira de uma vez.
      do {
        companies = await prisma.company.findMany({
          where: afterCompanyId === undefined ? {} : { id: { gt: afterCompanyId } },
          select: { id: true },
          orderBy: { id: "asc" },
          take: batchSize,
        });

        for (const { id: companyId } of companies) {
          // Antes de cada empresa, menos a primeira: também é um intervalo entre dois lotes.
          if (result.companies > 0 && shouldStop()) {
            return result;
          }

          const { anonymized, deleted } = await applyCompanyRetention(companyId, now, batchSize, shouldStop);

          result.companies += 1;
          result.anonymized += anonymized;
          result.deleted += deleted;
        }

        afterCompanyId = companies.at(-1)?.id;
      } while (companies.length === batchSize);

      return result;
    },
    { timeout: timeLimitMs + AUDIT_RETENTION_LOCK_MARGIN_MS },
  );
}

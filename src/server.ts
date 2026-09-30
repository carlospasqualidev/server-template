import { buildApp } from "@/app";
import { AUDIT_RETENTION_DAILY_RUN_UTC, AUDIT_RETENTION_SHUTDOWN_WAIT_MS } from "@/config/constants";
import { env } from "@/config/env";
import { swaggerUiOptions } from "@/config/swagger";
import { scheduleDailyJob } from "@/lib/jobs/dailySchedule";
import {
  type AuditRetentionResult,
  runAuditRetentionService,
} from "@/modules/audit/services/runAuditRetention.service";
import { syncPermissionCatalogService } from "@/modules/permissions/services/syncPermissionCatalog.service";

const app = buildApp();

/** Encerra pelo `app.close()`: os `onClose` param a retenção em curso (fim do lote) e só depois desconectam o banco. */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info(`${signal} recebido, encerrando...`);

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Falha ao encerrar");
    process.exit(1);
  }
}

/**
 * Leva o catálogo de permissões do código ao banco antes de aceitar requisição: a versão que sobe já encontra as
 * permissões que as rotas dela exigem. Depende do schema atualizado, por isso o `prisma migrate deploy` roda antes.
 * Instâncias subindo juntas se serializam pela trava do próprio service.
 */
async function syncPermissionCatalog(): Promise<void> {
  try {
    const { created, updated, removed } = await syncPermissionCatalogService();
    app.log.info({ created, updated, removed }, "Catálogo de permissões sincronizado");
  } catch (error) {
    throw new Error("Falha ao sincronizar o catálogo de permissões (as migrations foram aplicadas?)", {
      cause: error,
    });
  }
}

function auditRetentionLogMessage({ skipped, interrupted }: AuditRetentionResult): string {
  if (skipped) {
    return "Retenção da trilha de auditoria já em execução em outra instância";
  }

  return interrupted
    ? "Retenção da trilha de auditoria interrompida; a próxima execução continua de onde esta parou"
    : "Retenção da trilha de auditoria concluída";
}

/**
 * Uma execução da retenção. Não lança: a falha fica no log e a execução do dia seguinte continua de onde esta parou.
 * O `signal` é o do encerramento: acionado, a execução para no fim do lote em curso.
 */
async function runAuditRetention(signal: AbortSignal): Promise<void> {
  try {
    const result = await runAuditRetentionService({ now: new Date(), signal });
    app.log.info(result, auditRetentionLogMessage(result));
  } catch (error) {
    app.log.error(error, "Falha na retenção da trilha de auditoria");
  }
}

/**
 * Retenção diária da trilha de auditoria (anonimizar e depois apagar, pelos prazos de cada empresa), no horário fixo
 * `AUDIT_RETENTION_DAILY_RUN_UTC`. Toda instância agenda; a trava do service deixa uma só trabalhar. Desligada por
 * `AUDIT_RETENTION_ENABLED=false` (ex.: quando um cron externo roda `npm run audit:retention`) e sempre em teste. O
 * encerramento (`onClose`) cancela o agendamento e espera a execução em curso terminar o lote, até
 * `AUDIT_RETENTION_SHUTDOWN_WAIT_MS`, antes de o banco ser desconectado. Chamada antes do `listen`, porque depois dele o
 * Fastify não aceita hook, mas o timer só é armado quando o servidor passa a escutar (`onListen`): se o `listen` falhar,
 * nada fica agendado.
 */
function scheduleAuditRetention(): void {
  if (!env.auditRetentionEnabled) {
    app.log.info("Retenção da trilha de auditoria desligada (AUDIT_RETENTION_ENABLED)");

    return;
  }

  scheduleDailyJob(app, {
    name: "Retenção da trilha de auditoria",
    time: AUDIT_RETENTION_DAILY_RUN_UTC,
    run: runAuditRetention,
    onScheduled: (nextRunAt) =>
      app.log.info({ nextRunAt: nextRunAt.toISOString() }, "Retenção da trilha de auditoria agendada"),
    stopWaitMs: AUDIT_RETENTION_SHUTDOWN_WAIT_MS,
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  await syncPermissionCatalog();
  scheduleAuditRetention();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Documentação em http://localhost:${env.PORT}${swaggerUiOptions.routePrefix}`);
} catch (error) {
  app.log.error(error, "Falha ao subir o servidor");
  process.exit(1);
}

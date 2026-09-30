import { prisma } from "@/lib/prisma";
import { runAuditRetentionService } from "@/modules/audit/services/runAuditRetention.service";

/**
 * Uma execução da retenção da trilha de auditoria, sob demanda ou por um cron externo: `npm run audit:retention` em
 * desenvolvimento, `node dist/scripts/runAuditRetention.js` na imagem de produção. Mesma trava do agendamento do
 * servidor: com outra execução em andamento, sai sem fazer nada. Passado o tempo de trabalho, para entre dois lotes e
 * avisa (a próxima execução continua de onde esta parou). Falha sai com código 1.
 */
try {
  const { skipped, companies, anonymized, deleted, interrupted } = await runAuditRetentionService({ now: new Date() });
  const counts = `${companies} empresa(s), ${anonymized} evento(s) anonimizado(s), ${deleted} evento(s) apagado(s)`;

  if (skipped) {
    console.info("Retenção da trilha de auditoria já em execução em outra instância: nada feito.");
  } else if (interrupted) {
    console.info(
      `Retenção da trilha de auditoria interrompida pelo tempo limite: ${counts}. A próxima execução continua de onde esta parou.`,
    );
  } else {
    console.info(`Retenção da trilha de auditoria concluída: ${counts}.`);
  }
} catch (error) {
  console.error("Falha na retenção da trilha de auditoria:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

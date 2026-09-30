import { anonymizeAuditLogsService } from "@/modules/audit/services/anonymizeAuditLogs.service";

interface AnonymizeAuditForUserInput {
  companyId: string;
  userId: string;
}

/**
 * Pedido de eliminação de um titular (LGPD): anonimiza já, sem esperar o prazo da empresa, os eventos da trilha em que
 * o usuário é o autor (`userId`) ou o registro afetado (`entity = User`, `entityId` = o usuário), só na empresa dele.
 * Os eventos ficam, sem autor, IP, user-agent, dados pessoais e nome na frase (ver `anonymizeAuditLogsService`); o
 * `entityId` continua (é o id, não o dado pessoal). Idempotente: o evento já anonimizado não é tocado. Sem rota: quem
 * atende o pedido chama o service (um script, ou a rota que um projeto derivado criar). Devolve quantos anonimizou.
 */
export async function anonymizeAuditForUserService({
  companyId,
  userId,
}: AnonymizeAuditForUserInput): Promise<{ anonymized: number }> {
  const anonymized = await anonymizeAuditLogsService({
    where: { companyId, OR: [{ userId }, { entity: "User", entityId: userId }] },
    anonymizedAt: new Date(),
  });

  return { anonymized };
}

import { type AuditModule, type Prisma } from "@/generated/prisma/client";
import { type AuditValue } from "@/lib/audit/auditSnapshot";
import { prisma } from "@/lib/prisma";
import { type AuditEntity, type AuditExportFormat } from "@/modules/audit/audit.catalog";
import { exportAuditDescription } from "@/modules/audit/audit.descriptions";
import { recordAuditService } from "@/modules/audit/services/recordAudit.service";

/** Valor de um filtro como a trilha o guarda: lista vira `"a, b"`, data vira ISO; ausente ou lista vazia não entra. */
export type ExportAuditFilterValue = AuditValue | Date | readonly (string | number | boolean)[] | undefined;

interface RecordExportAuditInput {
  companyId: string;
  /** Módulo da tela que exporta (o mesmo das mutações da entidade: `USERS` para a lista de usuários). */
  module: AuditModule;
  /** O que foi exportado: dá a frase (`Exportou a lista de usuários em CSV.`) e o filtro por entidade. */
  entity: AuditEntity;
  format: AuditExportFormat;
  /**
   * Filtros aplicados à exportação, com chave pt-BR em camelCase, como o sul-oxidos (`{ busca: "ana", cargos: [...],
   * criadoDe: date }`): é o que a trilha mostra. Mande o valor já legível (nome do cargo, não o id) quando houver. O
   * termo de texto livre vai sempre em `busca` (`AUDIT_EXPORT_SEARCH_FILTER`): é o filtro que a anonimização omite.
   */
  filters: Readonly<Record<string, ExportAuditFilterValue>>;
}

/**
 * Registra uma exportação (ação `export`): quem retirou dados, de qual entidade, em qual formato e com quais filtros.
 * `after` = filtros + `formato`; sem `before`, `entityId` nem `changedFields`. Toda rota de exportação chama isto
 * depois de montar o arquivo e antes de responder; exportação que falha não é registrada. Sem transação própria: a
 * exportação não escreve nada (passe o `tx` quando houver um).
 */
export async function recordExportAuditService(
  { companyId, module, entity, format, filters }: RecordExportAuditInput,
  client: Prisma.TransactionClient = prisma,
): Promise<void> {
  await recordAuditService(
    {
      companyId,
      module,
      entity,
      entityId: null,
      action: "export",
      description: exportAuditDescription(entity, format),
      after: { ...filters, formato: format },
    },
    client,
  );
}

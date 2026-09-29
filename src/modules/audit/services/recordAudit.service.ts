import { type AuditAction, type AuditModule, Prisma } from "@/generated/prisma/client";
import { getAuditRequestMetadata } from "@/lib/audit/auditContext";
import { type AuditSnapshot, computeChangedFields, pickAuditable, redactAuditable } from "@/lib/audit/auditSnapshot";
import { type AuditEntity, AUDIT_PERSONAL_FIELDS } from "@/modules/audit/audit.catalog";

export interface AuditEntry {
  /** Empresa do registro afetado: a trilha é lida por empresa. */
  companyId: string;
  module: AuditModule;
  entity: AuditEntity;
  /** Id do registro afetado (a chave, no caso de configuração); `null` quando não há um. */
  entityId: string | null;
  action: AuditAction;
  /** Frase pt-BR no passado, sem nome, e-mail ou outro dado pessoal: "Cadastrou um usuário". */
  description: string;
  /** Estado anterior (a linha inteira; `pickAuditable` cura). Ausente na criação e no login. */
  before?: object | null;
  /** Estado posterior. Ausente na exclusão e no login. */
  after?: object | null;
  /** Campos cujo valor vira o marcador, além dos pessoais da entidade (ex.: configuração com `redactInAudit`). */
  redactedFields?: readonly string[];
  /** Campos que mudaram e não entram em `before`/`after` porque são segredo (ex.: `password`): só o nome é gravado. */
  hiddenChangedFields?: readonly string[];
  /**
   * Autor quando não há sessão (login, register). Com sessão, o autor vem do contexto da requisição (`requireSession`);
   * sem nenhum dos dois, o registro fica sem autor (ação do sistema).
   */
  userId?: string;
}

function toJsonColumn(snapshot: AuditSnapshot | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return snapshot ?? Prisma.DbNull;
}

/**
 * Grava na trilha de auditoria, **pelo `tx` da mutação**: o registro confirma ou desfaz junto com ela, então a trilha
 * nunca diz que algo mudou quando não mudou. Aceita um registro ou uma lista (um por item do lote), numa inserção só.
 *
 * O diff (`changedFields`) sai de `before`/`after` já curados, antes de o dado pessoal virar marcador. Um `update` sem
 * nenhum campo alterado não é gravado: salvar sem mudar nada não entra na trilha.
 */
export async function recordAuditService(
  entries: AuditEntry | AuditEntry[],
  tx: Prisma.TransactionClient,
): Promise<void> {
  const metadata = getAuditRequestMetadata();

  const data = (Array.isArray(entries) ? entries : [entries]).flatMap((entry): Prisma.AuditLogCreateManyInput[] => {
    const before = pickAuditable(entry.before);
    const after = pickAuditable(entry.after);
    const changedFields = [...computeChangedFields(before, after), ...(entry.hiddenChangedFields ?? [])];

    if (entry.action === "update" && changedFields.length === 0) {
      return [];
    }

    const redacted = new Set([...(AUDIT_PERSONAL_FIELDS.get(entry.entity) ?? []), ...(entry.redactedFields ?? [])]);

    return [
      {
        companyId: entry.companyId,
        module: entry.module,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        description: entry.description,
        before: toJsonColumn(redactAuditable(before, redacted)),
        after: toJsonColumn(redactAuditable(after, redacted)),
        changedFields,
        userId: entry.userId ?? metadata?.userId ?? null,
        requestId: metadata?.requestId ?? null,
        ip: metadata?.ip ?? null,
        userAgent: metadata?.userAgent ?? null,
      },
    ];
  });

  if (data.length > 0) {
    await tx.auditLog.createMany({ data });
  }
}

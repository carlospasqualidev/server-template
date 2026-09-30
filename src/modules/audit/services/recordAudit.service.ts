import { type AuditAction, type AuditModule, Prisma } from "@/generated/prisma/client";
import { getAuditRequestMetadata } from "@/lib/audit/auditContext";
import { type AuditSnapshot, computeChangedFields, pickAuditable, redactAuditable } from "@/lib/audit/auditSnapshot";
import { type AuditEntity, type AuditLabeledField } from "@/modules/audit/audit.catalog";

interface AuditEntryBase {
  /** Empresa do registro afetado: a trilha é lida por empresa. */
  companyId: string;
  module: AuditModule;
  /** Id do registro afetado (a chave, no caso de configuração); `null` quando não há um. */
  entityId: string | null;
  /**
   * Frase pt-BR no passado, com o nome do registro afetado, sempre de `AUDIT_DESCRIPTIONS` (`audit.descriptions.ts`):
   * `Criou o usuário "Maria Alves".`. Nunca e-mail, senha ou outro dado além do nome.
   */
  description: string;
  /**
   * Autor quando não há sessão (login, register). Com sessão, o autor vem do contexto da requisição (`requireSession`);
   * sem nenhum dos dois, o registro fica sem autor (ação do sistema).
   */
  userId?: string;
}

/**
 * Estado de um registro de `TEntity` para a trilha: a linha inteira (`pickAuditable` cura) ou o estado montado. Só
 * campo com rótulo em `AUDIT_FIELD_LABELS`: num objeto escrito na entrada, campo sem rótulo não compila. Valor
 * recebido de uma função (não literal) o TypeScript não confere chave a mais: o estado montado em função auxiliar
 * termina em `satisfies AuditFieldValues<entidade>`.
 */
export type AuditState<TEntity extends AuditEntity> = Readonly<Partial<Record<AuditLabeledField<TEntity>, unknown>>>;

/** Entrada de uma mutação ou de um login de `TEntity`. */
export interface AuditEntry<TEntity extends AuditEntity> extends AuditEntryBase {
  entity: TEntity;
  action: Exclude<AuditAction, "export">;
  /** Estado anterior. Ausente na criação e no login. */
  before?: AuditState<TEntity> | null;
  /** Estado posterior. Ausente na exclusão e no login. */
  after?: AuditState<TEntity> | null;
  /**
   * Campos cujo valor vira o marcador `[omitido]`: valor secreto que o nome do campo não denuncia (ex.: configuração
   * com `redactInAudit`). Dado pessoal não entra aqui: é gravado.
   */
  redactedFields?: readonly AuditLabeledField<TEntity>[];
  /** Campos que mudaram e não entram em `before`/`after` porque são segredo (ex.: `password`): só o nome é gravado. */
  hiddenChangedFields?: readonly AuditLabeledField<TEntity>[];
}

/**
 * Entrada de uma exportação, montada só por `recordExportAuditService`: o `after` são os filtros (chave pt-BR livre) e
 * o formato, não campos da entidade.
 */
export interface AuditExportEntry extends AuditEntryBase {
  entity: AuditEntity;
  action: "export";
  after: Readonly<Record<string, unknown>>;
  before?: never;
  redactedFields?: never;
  hiddenChangedFields?: never;
}

/** Qualquer entrada, discriminada por `entity` (e pela ação `export`): uma lista pode misturar entidades. */
export type AnyAuditEntry = { [TEntity in AuditEntity]: AuditEntry<TEntity> }[AuditEntity] | AuditExportEntry;

function toJsonColumn(snapshot: AuditSnapshot | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return snapshot ?? Prisma.DbNull;
}

/**
 * Grava na trilha de auditoria, **pelo `tx` da mutação**: o registro confirma ou desfaz junto com ela, então a trilha
 * nunca diz que algo mudou quando não mudou. Aceita um registro ou uma lista (um por item do lote), numa inserção só.
 *
 * `before`/`after` guardam os valores, dados pessoais inclusive (decisão do dono; o prazo e a anonimização são da
 * retenção, com `AUDIT_PERSONAL_FIELDS`). Segredo nunca entra: sai em `pickAuditable` pelo nome do campo, ou vira o
 * marcador por `redactedFields`, depois do diff. Um `update` sem nenhum campo alterado não é gravado: salvar sem mudar
 * nada não entra na trilha.
 */
export async function recordAuditService(
  entries: AnyAuditEntry | readonly AnyAuditEntry[],
  tx: Prisma.TransactionClient,
): Promise<void> {
  const metadata = getAuditRequestMetadata();
  const entryList: readonly AnyAuditEntry[] = Array.isArray(entries) ? entries : [entries];

  const data = entryList.flatMap((entry): Prisma.AuditLogCreateManyInput[] => {
    const before = pickAuditable(entry.before);
    const after = pickAuditable(entry.after);
    const changedFields = [...computeChangedFields(before, after), ...(entry.hiddenChangedFields ?? [])];

    if (entry.action === "update" && changedFields.length === 0) {
      return [];
    }

    const redacted = new Set<string>(entry.redactedFields);

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

import { AUDIT_RETENTION_BATCH_SIZE } from "@/config/constants";
import { type AuditAction, type Prisma } from "@/generated/prisma/client";
import { redactAuditable, toAuditSnapshot } from "@/lib/audit/auditSnapshot";
import { prisma } from "@/lib/prisma";
import {
  AUDIT_ENTITIES,
  AUDIT_EXPORT_SEARCH_FILTER,
  AUDIT_PERSONAL_FIELDS,
  type AuditEntity,
  type AuditLabeledField,
} from "@/modules/audit/audit.catalog";
import { genericAuditDescription } from "@/modules/audit/audit.descriptions";
import { lookupSystemConfigDefinition } from "@/modules/systemConfigs/systemConfig.catalog";

interface AnonymizeAuditLogsInput {
  /** Quais eventos. O service acrescenta `anonymizedAt: null`: só os ainda não anonimizados, uma vez só. */
  where: Prisma.AuditLogWhereInput;
  /** Gravado em `anonymizedAt`. */
  anonymizedAt: Date;
  /** Eventos por comando. Padrão: `AUDIT_RETENTION_BATCH_SIZE`. */
  batchSize?: number;
  /** Consultado entre dois lotes: `true` para parar ali, com o que já foi feito. Sem ele, vai até esvaziar. */
  shouldStop?: () => boolean;
}

interface AuditLogContent {
  entity: string;
  entityId: string | null;
  action: AuditAction;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
}

interface AnonymizedAuditLogContent {
  description: string | null;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
}

/**
 * Campos de `before`/`after` que a anonimização troca pelo marcador: os campos pessoais da entidade
 * (`AUDIT_PERSONAL_FIELDS`); numa exportação, o termo de busca (texto livre: pode ser um nome ou um e-mail digitado;
 * os demais filtros ficam); numa configuração marcada como dado pessoal no catálogo (`personalData`, como
 * `app.supportEmail`), o valor. Chave que saiu do catálogo de configurações fica como está.
 */
function personalFieldsOf(entity: AuditEntity, { entityId, action }: AuditLogContent): ReadonlySet<string> {
  const fields = new Set<string>(AUDIT_PERSONAL_FIELDS.get(entity));

  if (action === "export") {
    fields.add(AUDIT_EXPORT_SEARCH_FILTER);
  }

  if (entity === "SystemConfig" && entityId !== null && lookupSystemConfigDefinition(entityId)?.personalData) {
    fields.add("value" satisfies AuditLabeledField<"SystemConfig">);
  }

  return fields;
}

/**
 * O conteúdo do evento sem dado pessoal: a frase genérica da ação e da entidade (sem nome) e os campos pessoais
 * (`personalFieldsOf`) trocados pelo marcador; `null` continua `null`, e o valor é trocado sem tirar a chave (o de→para
 * lê as chaves). Entidade que saiu do catálogo (registro antigo) perde a frase, que pode ter o nome, e mantém
 * `before`/`after`, porque não se sabe quais campos dela são pessoais.
 */
function toAnonymizedContent(log: AuditLogContent): AnonymizedAuditLogContent {
  const entity = AUDIT_ENTITIES.find((known) => known === log.entity);

  if (!entity) {
    return { description: null, before: log.before, after: log.after };
  }

  const personalFields = personalFieldsOf(entity, log);

  return {
    description: genericAuditDescription(entity, log.action),
    before: redactAuditable(toAuditSnapshot(log.before), personalFields),
    after: redactAuditable(toAuditSnapshot(log.after), personalFields),
  };
}

/**
 * Anonimiza os eventos da trilha que casam com `where`, em lotes, até não sobrar nenhum (ou até `shouldStop` pedir,
 * entre dois lotes): `userId`, `ip` e `userAgent` viram nulo, os campos pessoais de `before`/`after` viram `[omitido]`,
 * a `description` vira a frase genérica e `anonymizedAt` marca o evento, que não é reprocessado. `module`, `entity`,
 * `entityId`, `action`, `changedFields`, `requestId` e `createdAt` ficam. Devolve quantos eventos anonimizou.
 *
 * Cada lote é um comando que confirma sozinho (sem transação longa). O `UPDATE` só pega evento ainda sem
 * `anonymizedAt`: se outra execução anonimizou o mesmo evento no meio do lote, ele não é reescrito nem contado de novo.
 * Usado pela retenção por prazo (`runAuditRetentionService`) e pelo pedido de um titular (`anonymizeAuditForUserService`).
 */
export async function anonymizeAuditLogsService({
  where,
  anonymizedAt,
  batchSize = AUDIT_RETENTION_BATCH_SIZE,
  shouldStop,
}: AnonymizeAuditLogsInput): Promise<number> {
  let anonymized = 0;
  let batch: ({ id: string } & AuditLogContent)[];

  do {
    batch = await prisma.auditLog.findMany({
      where: { ...where, anonymizedAt: null },
      select: { id: true, entity: true, entityId: true, action: true, before: true, after: true },
      // A ordem do índice `[companyId, anonymizedAt, createdAt]` é o que faz o Postgres usá-lo na varredura por idade.
      // Sem ordem, ele não sabe que os eventos velhos já foram anonimizados, estima muitos pendentes e varre a tabela;
      // só com `createdAt`, percorre o `[companyId, createdAt]` descartando os já anonimizados um a um. Com
      // `anonymizedAt` na frente (sempre nulo aqui), lê direto os pendentes. O pedido de titular vai pelos índices de
      // autor e de registro, e a ordem só custa ordenar o lote.
      orderBy: [{ anonymizedAt: "asc" }, { createdAt: "asc" }],
      take: batchSize,
    });

    if (batch.length > 0) {
      const changes = batch.map((log) => ({ id: log.id, ...toAnonymizedContent(log) }));

      // Um comando por lote: o conteúdo novo de cada evento vai como um parâmetro JSON só, aberto em linhas por
      // `jsonb_to_recordset` (JSON `null` vira SQL `NULL`, como a coluna guarda a ausência de `before`/`after`).
      anonymized += await prisma.$executeRaw`
        UPDATE audit_logs AS log
        SET "userId" = NULL,
            ip = NULL,
            "userAgent" = NULL,
            "anonymizedAt" = ${anonymizedAt},
            description = change.description,
            before = change.before,
            after = change.after
        FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb)
          AS change(id text, description text, before jsonb, after jsonb)
        WHERE log.id = change.id
          AND log."anonymizedAt" IS NULL`;
    }
  } while (batch.length === batchSize && !shouldStop?.());

  return anonymized;
}

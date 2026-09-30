import { type Prisma } from "@/generated/prisma/client";
import { toAuditSnapshot } from "@/lib/audit/auditSnapshot";
import { toAuditFieldChanges } from "@/modules/audit/audit.fieldChanges";

/**
 * Colunas do detalhe, com `before`, `after` e o autor. O nome do autor vem do cadastro (relacionamento com `User`),
 * nunca de cópia no registro: é o nome atual, e o de um usuário excluído continua aparecendo. `requestId`, `ip` e
 * `userAgent` não saem pela API. Espelha `auditLogDetailSchema`. A listagem é SQL tagueado (`listAuditLogsService`),
 * com as mesmas colunas da base mais o `userName`.
 */
export const auditLogDetailSelect = {
  id: true,
  module: true,
  entity: true,
  entityId: true,
  action: true,
  description: true,
  changedFields: true,
  userId: true,
  createdAt: true,
  before: true,
  after: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AuditLogSelect;

type AuditLogDetailRow = Prisma.AuditLogGetPayload<{ select: typeof auditLogDetailSelect }>;

export function toAuditLogDetail({ before, after, ...log }: AuditLogDetailRow) {
  const snapshots = { before: toAuditSnapshot(before), after: toAuditSnapshot(after) };

  return { ...log, ...snapshots, fieldChanges: toAuditFieldChanges({ ...log, ...snapshots }) };
}

/**
 * Colunas de um item da linha do tempo de um registro: as da lista, mais `before`/`after`, lidos só para montar o
 * de→para (`fieldChanges`), que é o que sai no lugar deles. Espelha `auditLogTimelineItemSchema`.
 */
export const auditLogTimelineSelect = {
  id: true,
  module: true,
  entity: true,
  entityId: true,
  action: true,
  description: true,
  changedFields: true,
  userId: true,
  createdAt: true,
  before: true,
  after: true,
  user: { select: { name: true } },
} satisfies Prisma.AuditLogSelect;

type AuditLogTimelineRow = Prisma.AuditLogGetPayload<{ select: typeof auditLogTimelineSelect }>;

export function toAuditLogTimelineItem({ before, after, user, ...log }: AuditLogTimelineRow) {
  const fieldChanges = toAuditFieldChanges({
    ...log,
    before: toAuditSnapshot(before),
    after: toAuditSnapshot(after),
  });

  return { ...log, userName: user?.name ?? null, fieldChanges };
}

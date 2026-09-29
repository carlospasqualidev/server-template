import { type Prisma } from "@/generated/prisma/client";
import { toAuditSnapshot } from "@/lib/audit/auditSnapshot";

const auditLogBaseSelect = {
  id: true,
  module: true,
  entity: true,
  entityId: true,
  action: true,
  description: true,
  changedFields: true,
  userId: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

/**
 * Colunas da listagem. O nome do autor vem do cadastro (relacionamento com `User`), nunca de cópia no registro: é o
 * nome atual, e o de um usuário excluído continua aparecendo. `requestId`, `ip` e `userAgent` não saem pela API.
 * Espelha `auditLogListItemSchema` depois de `toAuditLogListItem`.
 */
export const auditLogListSelect = {
  ...auditLogBaseSelect,
  user: { select: { name: true } },
} satisfies Prisma.AuditLogSelect;

/** Colunas do detalhe: a listagem sem o `userName`, com `before`, `after` e o autor. Espelha `auditLogDetailSchema`. */
export const auditLogDetailSelect = {
  ...auditLogBaseSelect,
  before: true,
  after: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AuditLogSelect;

type AuditLogListRow = Prisma.AuditLogGetPayload<{ select: typeof auditLogListSelect }>;
type AuditLogDetailRow = Prisma.AuditLogGetPayload<{ select: typeof auditLogDetailSelect }>;

export function toAuditLogListItem({ user, ...log }: AuditLogListRow) {
  return { ...log, userName: user?.name ?? null };
}

export function toAuditLogDetail({ before, after, ...log }: AuditLogDetailRow) {
  return { ...log, before: toAuditSnapshot(before), after: toAuditSnapshot(after) };
}

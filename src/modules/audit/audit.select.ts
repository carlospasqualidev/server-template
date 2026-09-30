import { type Prisma } from "@/generated/prisma/client";
import { toAuditSnapshot } from "@/lib/audit/auditSnapshot";

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
  return { ...log, before: toAuditSnapshot(before), after: toAuditSnapshot(after) };
}

import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { auditLogDetailSelect, toAuditLogDetail } from "@/modules/audit/audit.select";

interface FindAuditLogByIdInput {
  companyId: string;
  auditLogId: string;
}

/** Registro da trilha com antes, depois e autor. De outra empresa responde 404, como inexistente. */
export async function findAuditLogByIdService({ companyId, auditLogId }: FindAuditLogByIdInput) {
  const auditLog = await prisma.auditLog.findFirst({
    where: { id: auditLogId, companyId },
    select: auditLogDetailSelect,
  });

  if (!auditLog) {
    throw new NotFoundError("Registro de auditoria não encontrado.");
  }

  return toAuditLogDetail(auditLog);
}

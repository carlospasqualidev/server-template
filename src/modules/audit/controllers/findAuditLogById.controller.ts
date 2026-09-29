import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type AuditLogParams } from "@/modules/audit/schemas/auditLog.schemas";
import { findAuditLogByIdService } from "@/modules/audit/services/findAuditLogById.service";

export async function findAuditLogByIdController(
  request: FastifyRequest<{ Params: AuditLogParams }>,
  reply: FastifyReply,
) {
  const { companyId } = getAuthenticatedUser(request);

  const auditLog = await findAuditLogByIdService({ companyId, auditLogId: request.params.auditLogId });

  return reply.status(200).send({ auditLog });
}

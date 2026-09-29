import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type ListAuditLogsQuery } from "@/modules/audit/schemas/listAuditLogs.schema";
import { listAuditLogsService } from "@/modules/audit/services/listAuditLogs.service";

export async function listAuditLogsController(
  request: FastifyRequest<{ Querystring: ListAuditLogsQuery }>,
  reply: FastifyReply,
) {
  const { companyId } = getAuthenticatedUser(request);

  const result = await listAuditLogsService({ companyId, query: request.query });

  return reply.status(200).send(result);
}

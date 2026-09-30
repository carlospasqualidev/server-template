import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import {
  type ListAuditLogsByEntityParams,
  type ListAuditLogsByEntityQuery,
} from "@/modules/audit/schemas/listAuditLogsByEntity.schema";
import { listAuditLogsByEntityService } from "@/modules/audit/services/listAuditLogsByEntity.service";

export async function listAuditLogsByEntityController(
  request: FastifyRequest<{ Params: ListAuditLogsByEntityParams; Querystring: ListAuditLogsByEntityQuery }>,
  reply: FastifyReply,
) {
  const { companyId } = getAuthenticatedUser(request);
  const { entity, entityId } = request.params;

  const result = await listAuditLogsByEntityService({ companyId, entity, entityId, query: request.query });

  return reply.status(200).send(result);
}

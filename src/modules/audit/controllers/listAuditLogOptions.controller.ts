import { type FastifyReply, type FastifyRequest } from "fastify";

import { listAuditLogOptionsService } from "@/modules/audit/services/listAuditLogOptions.service";

export async function listAuditLogOptionsController(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send(listAuditLogOptionsService());
}

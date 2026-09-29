import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { listSystemConfigsService } from "@/modules/systemConfigs/services/listSystemConfigs.service";

export async function listSystemConfigsController(request: FastifyRequest, reply: FastifyReply) {
  const { companyId } = getAuthenticatedUser(request);

  const systemConfigs = await listSystemConfigsService({ companyId });

  return reply.status(200).send({ systemConfigs });
}

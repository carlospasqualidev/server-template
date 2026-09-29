import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type UpdateSystemConfigsBody } from "@/modules/systemConfigs/schemas/updateSystemConfigs.schema";
import { updateSystemConfigsService } from "@/modules/systemConfigs/services/updateSystemConfigs.service";

export async function updateSystemConfigsController(
  request: FastifyRequest<{ Body: UpdateSystemConfigsBody }>,
  reply: FastifyReply,
) {
  const { companyId } = getAuthenticatedUser(request);

  const systemConfigs = await updateSystemConfigsService({ companyId, items: request.body.items });

  return reply.status(200).send({ message: "Configurações atualizadas.", systemConfigs });
}

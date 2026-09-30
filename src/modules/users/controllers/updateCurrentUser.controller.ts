import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type UpdateCurrentUserBody } from "@/modules/users/schemas/updateCurrentUser.schema";
import { updateCurrentUserService } from "@/modules/users/services/updateCurrentUser.service";

export async function updateCurrentUserController(
  request: FastifyRequest<{ Body: UpdateCurrentUserBody }>,
  reply: FastifyReply,
) {
  // As permissões já vieram do banco nesta requisição, no `requireSession`.
  const { id, companyId, permissions } = getAuthenticatedUser(request);

  const user = await updateCurrentUserService({ companyId, userId: id, data: request.body });

  return reply.status(200).send({ message: "Perfil atualizado.", user: { ...user, permissions } });
}

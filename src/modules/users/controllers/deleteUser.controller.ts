import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type UserParams } from "@/modules/users/schemas/user.schemas";
import { deleteUserService } from "@/modules/users/services/deleteUser.service";

export async function deleteUserController(request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) {
  const { companyId, id: currentUserId } = getAuthenticatedUser(request);

  await deleteUserService({ companyId, userId: request.params.userId, currentUserId });

  return reply.status(200).send({ message: "Usuário excluído." });
}

import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type UserParams } from "@/modules/users/schemas/user.schemas";
import { findUserByIdService } from "@/modules/users/services/findUserById.service";

export async function findUserByIdController(request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) {
  const { companyId } = getAuthenticatedUser(request);

  const user = await findUserByIdService({ companyId, userId: request.params.userId });

  return reply.status(200).send({ user });
}

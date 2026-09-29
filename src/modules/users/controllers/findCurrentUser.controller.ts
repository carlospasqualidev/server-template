import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { findCurrentUserService } from "@/modules/users/services/findCurrentUser.service";

export async function findCurrentUserController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = getAuthenticatedUser(request);

  const user = await findCurrentUserService(id);

  return reply.status(200).send({ user });
}

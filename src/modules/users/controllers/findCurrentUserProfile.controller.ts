import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { findCurrentUserProfileService } from "@/modules/users/services/findCurrentUserProfile.service";

export async function findCurrentUserProfileController(request: FastifyRequest, reply: FastifyReply) {
  const { id, companyId } = getAuthenticatedUser(request);

  const profile = await findCurrentUserProfileService({ companyId, userId: id });

  return reply.status(200).send({ profile });
}

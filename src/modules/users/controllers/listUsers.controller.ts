import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type ListUsersQuery } from "@/modules/users/schemas/listUsers.schema";
import { listUsersService } from "@/modules/users/services/listUsers.service";

export async function listUsersController(
  request: FastifyRequest<{ Querystring: ListUsersQuery }>,
  reply: FastifyReply,
) {
  const { companyId } = getAuthenticatedUser(request);

  const result = await listUsersService({ companyId, query: request.query });

  return reply.status(200).send(result);
}

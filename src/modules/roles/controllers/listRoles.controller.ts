import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type ListRolesQuery } from "@/modules/roles/schemas/listRoles.schema";
import { listRolesService } from "@/modules/roles/services/listRoles.service";

export async function listRolesController(
  request: FastifyRequest<{ Querystring: ListRolesQuery }>,
  reply: FastifyReply,
) {
  const { companyId } = getAuthenticatedUser(request);

  const result = await listRolesService({ companyId, query: request.query });

  return reply.status(200).send(result);
}

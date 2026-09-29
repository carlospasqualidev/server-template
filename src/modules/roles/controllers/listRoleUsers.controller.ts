import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type ListRoleUsersQuery } from "@/modules/roles/schemas/listRoleUsers.schema";
import { type RoleParams } from "@/modules/roles/schemas/role.schemas";
import { listRoleUsersService } from "@/modules/roles/services/listRoleUsers.service";

export async function listRoleUsersController(
  request: FastifyRequest<{ Params: RoleParams; Querystring: ListRoleUsersQuery }>,
  reply: FastifyReply,
) {
  const { companyId } = getAuthenticatedUser(request);

  const result = await listRoleUsersService({ companyId, roleId: request.params.roleId, query: request.query });

  return reply.status(200).send(result);
}

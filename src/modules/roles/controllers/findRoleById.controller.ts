import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type RoleParams } from "@/modules/roles/schemas/role.schemas";
import { findRoleByIdService } from "@/modules/roles/services/findRoleById.service";

export async function findRoleByIdController(request: FastifyRequest<{ Params: RoleParams }>, reply: FastifyReply) {
  const { companyId } = getAuthenticatedUser(request);

  const role = await findRoleByIdService({ companyId, roleId: request.params.roleId });

  return reply.status(200).send({ role });
}

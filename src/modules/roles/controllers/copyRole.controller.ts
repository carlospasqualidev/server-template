import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type RoleParams } from "@/modules/roles/schemas/role.schemas";
import { copyRoleService } from "@/modules/roles/services/copyRole.service";

export async function copyRoleController(request: FastifyRequest<{ Params: RoleParams }>, reply: FastifyReply) {
  const { companyId, id: actorId } = getAuthenticatedUser(request);

  const role = await copyRoleService({ companyId, actorId, roleId: request.params.roleId });

  return reply.status(201).send({ message: "Cargo copiado.", role });
}

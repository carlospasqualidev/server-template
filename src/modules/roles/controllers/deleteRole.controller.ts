import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type RoleParams } from "@/modules/roles/schemas/role.schemas";
import { deleteRoleService } from "@/modules/roles/services/deleteRole.service";

export async function deleteRoleController(request: FastifyRequest<{ Params: RoleParams }>, reply: FastifyReply) {
  const { companyId } = getAuthenticatedUser(request);

  await deleteRoleService({ companyId, roleId: request.params.roleId });

  return reply.status(200).send({ message: "Cargo excluído." });
}

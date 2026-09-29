import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type RoleParams, type SaveRoleBody } from "@/modules/roles/schemas/role.schemas";
import { updateRoleService } from "@/modules/roles/services/updateRole.service";

export async function updateRoleController(
  request: FastifyRequest<{ Params: RoleParams; Body: SaveRoleBody }>,
  reply: FastifyReply,
) {
  const { companyId, id: actorId } = getAuthenticatedUser(request);

  const role = await updateRoleService({ companyId, actorId, roleId: request.params.roleId, data: request.body });

  return reply.status(200).send({ message: "Cargo atualizado.", role });
}

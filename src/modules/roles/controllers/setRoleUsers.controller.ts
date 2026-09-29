import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type RoleParams } from "@/modules/roles/schemas/role.schemas";
import { type SetRoleUsersBody } from "@/modules/roles/schemas/setRoleUsers.schema";
import { setRoleUsersService } from "@/modules/roles/services/setRoleUsers.service";

export async function setRoleUsersController(
  request: FastifyRequest<{ Params: RoleParams; Body: SetRoleUsersBody }>,
  reply: FastifyReply,
) {
  const { companyId, id: actorId } = getAuthenticatedUser(request);

  const role = await setRoleUsersService({
    companyId,
    actorId,
    roleId: request.params.roleId,
    userIds: request.body.userIds,
  });

  return reply.status(200).send({ message: "Usuários do cargo atualizados.", role });
}

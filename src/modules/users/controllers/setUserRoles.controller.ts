import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type SetUserRolesBody } from "@/modules/users/schemas/setUserRoles.schema";
import { type UserParams } from "@/modules/users/schemas/user.schemas";
import { setUserRolesService } from "@/modules/users/services/setUserRoles.service";

export async function setUserRolesController(
  request: FastifyRequest<{ Params: UserParams; Body: SetUserRolesBody }>,
  reply: FastifyReply,
) {
  const { companyId, id: actorId } = getAuthenticatedUser(request);

  const user = await setUserRolesService({
    companyId,
    actorId,
    userId: request.params.userId,
    roleIds: request.body.roleIds,
  });

  return reply.status(200).send({ message: "Cargos do usuário atualizados.", user });
}

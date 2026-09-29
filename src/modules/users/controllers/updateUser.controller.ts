import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type UpdateUserBody } from "@/modules/users/schemas/updateUser.schema";
import { type UserParams } from "@/modules/users/schemas/user.schemas";
import { updateUserService } from "@/modules/users/services/updateUser.service";

export async function updateUserController(
  request: FastifyRequest<{ Params: UserParams; Body: UpdateUserBody }>,
  reply: FastifyReply,
) {
  const { companyId } = getAuthenticatedUser(request);

  const user = await updateUserService({ companyId, userId: request.params.userId, data: request.body });

  return reply.status(200).send({ message: "Usuário atualizado.", user });
}

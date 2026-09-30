import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type ChangeCurrentUserPasswordBody } from "@/modules/users/schemas/changeCurrentUserPassword.schema";
import { changeCurrentUserPasswordService } from "@/modules/users/services/changeCurrentUserPassword.service";

export async function changeCurrentUserPasswordController(
  request: FastifyRequest<{ Body: ChangeCurrentUserPasswordBody }>,
  reply: FastifyReply,
) {
  const { id, companyId } = getAuthenticatedUser(request);
  const { currentPassword, password } = request.body;

  await changeCurrentUserPasswordService({ companyId, userId: id, currentPassword, password });

  return reply.status(200).send({ message: "Senha alterada." });
}

import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type CreateUserBody } from "@/modules/users/schemas/createUser.schema";
import { createUserService } from "@/modules/users/services/createUser.service";

export async function createUserController(request: FastifyRequest<{ Body: CreateUserBody }>, reply: FastifyReply) {
  const { companyId } = getAuthenticatedUser(request);

  const user = await createUserService({ companyId, data: request.body });

  return reply.status(201).send({ message: "Usuário criado.", user });
}

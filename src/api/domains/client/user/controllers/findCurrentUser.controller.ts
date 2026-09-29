import { FastifyReply, FastifyRequest } from "fastify";
import { findCurrentUserService } from "../../../../services/user/findCurrentUser.service";
import { ErrorMessage } from "../../../../utils/error";

export async function findCurrentUserController(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) {
    throw new ErrorMessage({
      statusCode: "401 UNAUTHORIZED",
      message: "Token inválido ou não informado.",
    });
  }

  const user = await findCurrentUserService(req.user.id);

  return reply.status(200).send({ user });
}

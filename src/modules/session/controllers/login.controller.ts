import { type FastifyReply, type FastifyRequest } from "fastify";

import { openSession } from "@/lib/auth/session";
import { type LoginBody } from "@/modules/session/schemas/login.schema";
import { type SessionClientHeaders } from "@/modules/session/schemas/session.schemas";
import { authenticateUserService } from "@/modules/session/services/authenticateUser.service";

export async function loginController(
  request: FastifyRequest<{ Body: LoginBody; Headers: SessionClientHeaders }>,
  reply: FastifyReply,
) {
  const user = await authenticateUserService(request.body);
  const session = openSession(reply, user.id, request.headers["x-client-type"]);

  return reply.status(200).send({ success: true, user, ...session });
}

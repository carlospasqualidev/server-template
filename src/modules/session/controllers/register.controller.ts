import { type FastifyReply, type FastifyRequest } from "fastify";

import { openSession } from "@/lib/auth/session";
import { type RegisterBody } from "@/modules/session/schemas/register.schema";
import { type SessionClientHeaders } from "@/modules/session/schemas/session.schemas";
import { registerUserService } from "@/modules/session/services/registerUser.service";

export async function registerController(
  request: FastifyRequest<{ Body: RegisterBody; Headers: SessionClientHeaders }>,
  reply: FastifyReply,
) {
  const user = await registerUserService(request.body);
  const session = openSession(reply, user.id, request.headers["x-client-type"]);

  return reply.status(201).send({ success: true, user, ...session });
}

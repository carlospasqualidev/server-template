import { type FastifyReply, type FastifyRequest } from "fastify";

import { SESSION_COOKIE_NAME } from "@/config/constants";
import { sessionCookieOptions, signSessionToken } from "@/lib/auth/session";
import { type RegisterBody } from "@/modules/session/schemas/register.schema";
import { registerUserService } from "@/modules/session/services/registerUser.service";

export async function registerController(request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) {
  const user = await registerUserService(request.body);

  reply.setCookie(SESSION_COOKIE_NAME, signSessionToken(user.id), sessionCookieOptions);

  return reply.status(201).send({ success: true, user });
}

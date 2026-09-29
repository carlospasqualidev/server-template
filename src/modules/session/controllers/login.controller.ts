import { type FastifyReply, type FastifyRequest } from "fastify";

import { SESSION_COOKIE_NAME } from "@/config/constants";
import { sessionCookieOptions, signSessionToken } from "@/lib/auth/session";
import { type LoginBody } from "@/modules/session/schemas/login.schema";
import { authenticateUserService } from "@/modules/session/services/authenticateUser.service";

export async function loginController(request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
  const user = await authenticateUserService(request.body);

  reply.setCookie(SESSION_COOKIE_NAME, signSessionToken(user.id), sessionCookieOptions);

  return reply.status(200).send({ success: true, user });
}

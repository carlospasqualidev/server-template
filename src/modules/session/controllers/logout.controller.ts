import { type FastifyReply, type FastifyRequest } from "fastify";

import { SESSION_COOKIE_NAME } from "@/config/constants";
import { sessionCookieOptions } from "@/lib/auth/session";

export async function logoutController(_request: FastifyRequest, reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);

  return reply.status(200).send({ success: true });
}

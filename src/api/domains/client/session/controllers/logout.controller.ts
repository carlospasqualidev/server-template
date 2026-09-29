import { FastifyReply, FastifyRequest } from "fastify";

export async function logoutController(_req: FastifyRequest, reply: FastifyReply) {
  reply.clearCookie("token", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return reply.status(200).send({ success: true });
}

import { type FastifyReply, type FastifyRequest } from "fastify";

export async function getHealthController(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send({ status: "ok", uptime: Math.round(process.uptime()) });
}

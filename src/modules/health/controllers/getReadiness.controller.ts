import { type FastifyReply, type FastifyRequest } from "fastify";

import { ServiceUnavailableError } from "@/lib/errors";
import { checkDatabaseService } from "@/modules/health/services/checkDatabase.service";

export async function getReadinessController(_request: FastifyRequest, reply: FastifyReply) {
  const databaseIsUp = await checkDatabaseService();

  if (!databaseIsUp) {
    throw new ServiceUnavailableError("Banco de dados indisponível.");
  }

  return reply.status(200).send({ status: "ok", database: "ok" });
}

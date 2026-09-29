import { type FastifyReply, type FastifyRequest } from "fastify";

import { listPermissionCatalogService } from "@/modules/roles/services/listPermissionCatalog.service";

export async function listPermissionCatalogController(_request: FastifyRequest, reply: FastifyReply) {
  const modules = await listPermissionCatalogService();

  return reply.status(200).send({ modules });
}

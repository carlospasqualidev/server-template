import { type FastifyReply, type FastifyRequest } from "fastify";

import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { type SaveRoleBody } from "@/modules/roles/schemas/role.schemas";
import { createRoleService } from "@/modules/roles/services/createRole.service";

export async function createRoleController(request: FastifyRequest<{ Body: SaveRoleBody }>, reply: FastifyReply) {
  const { companyId, id: actorId } = getAuthenticatedUser(request);

  const role = await createRoleService({ companyId, actorId, data: request.body });

  return reply.status(201).send({ message: "Cargo criado.", role });
}

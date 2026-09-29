import { FastifyReply, FastifyRequest } from "fastify";
import { checkValues } from "../../../../utils/validator";
import { findUserByIdService } from "../../../../services/user/findUserById.service";

type FindUserByIdRequest = FastifyRequest<{
  Params: {
    userId: string;
  };
}>;

export async function findUserByIdController(req: FindUserByIdRequest, reply: FastifyReply) {
  const { userId } = req.params;

  checkValues([{ label: "Usuário", type: "string", value: userId }]);

  const user = await findUserByIdService({ userId });

  return reply.status(200).send({ user });
}

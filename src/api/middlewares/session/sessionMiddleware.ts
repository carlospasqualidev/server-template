import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../../../lib/prisma";
import { AuthenticatedUser } from "../../../types/authenticatedUser";
import { IToken } from "../../../types/token";
import { ErrorMessage } from "../../utils/error";
import { decodeToken } from "../../utils/token";

export async function sessionMiddleware(req: FastifyRequest, _reply: FastifyReply) {
  const token = req.cookies.token;

  const tokenErrorMessage = "Token inválido ou não informado.";

  if (!token) {
    throw new ErrorMessage({
      statusCode: "401 UNAUTHORIZED",
      message: tokenErrorMessage,
    });
  }

  let tokenData: IToken;

  try {
    tokenData = decodeToken(token) as IToken;
  } catch {
    throw new ErrorMessage({
      statusCode: "401 UNAUTHORIZED",
      message: tokenErrorMessage,
    });
  }

  const user = await prisma.user.findUnique({
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
    },
    where: { id: tokenData.user.id },
  });

  if (!user) {
    throw new ErrorMessage({
      statusCode: "401 UNAUTHORIZED",
      message: "Usuário não encontrado.",
    });
  }

  if (!user.isActive) {
    throw new ErrorMessage({
      statusCode: "403 FORBIDDEN",
      message: "Conta bloqueada.",
    });
  }

  const authenticatedUser: AuthenticatedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
  };

  req.user = authenticatedUser;
}

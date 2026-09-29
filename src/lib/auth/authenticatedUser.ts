import { type FastifyRequest } from "fastify";

import { UnauthorizedError } from "@/lib/errors/appError";

/** Usuário resolvido pelo hook `requireSession` e disponível em `request.user` nas rotas protegidas. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  /** Tenant. Todo service que lê ou escreve dado de negócio recebe e filtra por este id. */
  companyId: string;
}

/** Use nos controllers de rotas protegidas: devolve `request.user` já estreitado (nunca `null`). */
export function getAuthenticatedUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.user) {
    throw new UnauthorizedError();
  }

  return request.user;
}

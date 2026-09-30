import { type FastifyReply, type FastifyRequest } from "fastify";

import { setAuditActor } from "@/lib/audit/auditContext";
import { readBearerToken, verifySessionToken } from "@/lib/auth/session";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { findSessionUserService } from "@/modules/session/services/findSessionUser.service";

/**
 * Hook `onRequest` das rotas protegidas: lê o JWT do cabeçalho `Authorization: Bearer` (app nativo) ou, sem ele, do
 * cookie de sessão (`SESSION_COOKIE_NAME`, a web). Com os dois, vale o cabeçalho, mesmo inválido: não há recaída no
 * cookie. Valida o JWT, recarrega o usuário e as permissões efetivas do banco numa leitura só (para bloqueio, exclusão
 * e mudança de cargo valerem na hora; o JWT não carrega permissão) e preenche `request.user`. Registra também o usuário
 * como autor no contexto da requisição, lido só pela trilha de auditoria.
 */
export async function requireSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const { token: cookieToken } = request.cookies;
  const token = readBearerToken(request.headers.authorization) ?? cookieToken;

  if (!token) {
    throw new UnauthorizedError("Sessão não informada.");
  }

  const { userId } = verifySessionToken(token);
  const user = await findSessionUserService(userId);

  if (!user) {
    throw new UnauthorizedError("Usuário não encontrado.");
  }

  if (!user.isActive) {
    throw new ForbiddenError("Conta bloqueada.");
  }

  request.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    companyId: user.companyId,
    permissions: user.permissions,
  };
  setAuditActor(request, user.id);
}

import { type CookieSerializeOptions } from "@fastify/cookie";
import { type FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

import { MOBILE_CLIENT_TYPE, SESSION_COOKIE_NAME } from "@/config/constants";
import { env } from "@/config/env";
import { UnauthorizedError } from "@/lib/errors/appError";

/** Opções do cookie de sessão. Usadas tanto para gravar (login) quanto para limpar (logout). */
export const sessionCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  path: "/",
  secure: env.isProduction,
  sameSite: "lax",
  maxAge: env.sessionTtlSeconds,
};

/** Esquema `Bearer` do cabeçalho `Authorization` (RFC 6750). O nome do esquema não diferencia maiúsculas (RFC 9110). */
const BEARER_SCHEME = /^Bearer(?:\s+|$)/i;

/** JWT curto: só o `sub` (id do usuário). Os dados do usuário são relidos do banco a cada requisição. */
export function signSessionToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: env.sessionTtlSeconds });
}

export function verifySessionToken(token: string): { userId: string } {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);

    if (typeof payload === "string" || !payload.sub) {
      throw new Error("Token sem subject.");
    }

    return { userId: payload.sub };
  } catch {
    throw new UnauthorizedError("Sessão inválida ou expirada.");
  }
}

/** O que a abertura da sessão soma ao corpo da resposta: o JWT, só para o app nativo. */
export interface OpenedSession {
  token?: string;
}

/**
 * Abre a sessão do usuário na resposta do login e do register. Web (sem `X-Client-Type: mobile`): grava o cookie
 * HTTP-only, e o token não sai no corpo. App nativo (`X-Client-Type: mobile`): o token vai só no corpo, para o
 * armazenamento seguro do aparelho, e o cookie não é gravado. A pilha HTTP nativa guardaria o cookie no pote de cookies
 * do sistema, uma segunda cópia da credencial fora do armazenamento seguro, e ela manteria a sessão aberta depois que o
 * app descarta o token no logout: sem `Authorization`, o `requireSession` lê o cookie.
 */
export function openSession(reply: FastifyReply, userId: string, clientType: string | undefined): OpenedSession {
  const token = signSessionToken(userId);

  if (clientType === MOBILE_CLIENT_TYPE) {
    return { token };
  }

  reply.setCookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);

  return {};
}

/**
 * Credencial do cabeçalho `Authorization` quando o esquema é `Bearer` (o app nativo). Sem o cabeçalho, ou com outro
 * esquema, devolve `undefined`: o `Basic` que um proxy com senha faz o navegador repetir em toda requisição não é
 * sessão, e a web segue pelo cookie. `Bearer` sem credencial devolve `""`, que o `requireSession` recusa sem ler o
 * cookie (o cabeçalho, quando é `Bearer`, vale sobre ele).
 */
export function readBearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined || !BEARER_SCHEME.test(authorization)) {
    return undefined;
  }

  return authorization.replace(BEARER_SCHEME, "").trim();
}

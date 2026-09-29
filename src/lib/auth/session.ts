import { type CookieSerializeOptions } from "@fastify/cookie";
import jwt from "jsonwebtoken";

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

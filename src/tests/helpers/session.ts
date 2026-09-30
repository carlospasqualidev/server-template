import { SESSION_COOKIE_NAME } from "@/config/constants";
import { signSessionToken } from "@/lib/auth/session";

/** Cookies de uma sessão válida para o usuário, sem passar pelo login. Use em `inject({ cookies })`. */
export function sessionCookiesFor(userId: string): Record<string, string> {
  return { [SESSION_COOKIE_NAME]: signSessionToken(userId) };
}

/** Cabeçalho `Authorization: Bearer` de uma sessão válida (o app nativo), sem passar pelo login. Use em `inject({ headers })`. */
export function bearerHeadersFor(userId: string): Record<string, string> {
  return { authorization: `Bearer ${signSessionToken(userId)}` };
}

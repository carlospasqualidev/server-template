/**
 * `security` do schema de toda rota protegida, no OpenAPI: a sessão vale pelo cookie (`cookieAuth`, a web) ou pelo
 * cabeçalho `Authorization: Bearer` (`bearerAuth`, o app nativo), qualquer um dos dois. Os nomes são os
 * `securitySchemes` de `src/config/swagger.ts`; quem confere a sessão de fato é o `requireSession`.
 */
export const sessionSecurity: readonly Readonly<Record<string, readonly string[]>>[] = [
  { cookieAuth: [] },
  { bearerAuth: [] },
];

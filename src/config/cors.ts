import { type FastifyCorsOptions } from "@fastify/cors";

import { env } from "@/config/env";

export const corsOptions: FastifyCorsOptions = {
  origin: env.corsOrigins,
  credentials: true,
  // Sem `methods`, o plugin libera só `GET,HEAD,POST` e o navegador barra no preflight todo `PUT`, `PATCH` e `DELETE`
  // da API. `OPTIONS` fica de fora: o preflight não é conferido contra a lista.
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
};

const allowedOrigins: ReadonlySet<string> = new Set(env.corsOrigins);

/**
 * Os cabeçalhos que o `@fastify/cors` põe numa requisição comum com as `corsOptions` acima, para a resposta que não
 * passa pelos hooks do Fastify (erro do roteador, em `frameworkErrors`): sem eles, o navegador esconde do frontend o
 * corpo do erro. Mude os dois juntos. A lista nunca tem `*` (o `env.ts` recusa): cada origem é comparada literalmente.
 * `methods` não entra: o plugin só o manda no preflight (`Access-Control-Allow-Methods`), e um preflight que cai aqui
 * já falha no navegador pelo status de erro, com ou sem esse cabeçalho.
 */
export function corsHeadersFor(origin: string | undefined): Record<string, string> {
  return {
    vary: "Origin",
    ...(origin !== undefined && allowedOrigins.has(origin) && { "access-control-allow-origin": origin }),
    "access-control-allow-credentials": "true",
  };
}

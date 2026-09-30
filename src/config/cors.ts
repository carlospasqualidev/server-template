import { type FastifyCorsOptions } from "@fastify/cors";

import { env } from "@/config/env";

export const corsOptions: FastifyCorsOptions = {
  origin: env.corsOrigins,
  credentials: true,
};

const allowedOrigins: ReadonlySet<string> = new Set(env.corsOrigins);

/**
 * Os cabeçalhos que o `@fastify/cors` põe numa requisição comum com as `corsOptions` acima, para a resposta que não
 * passa pelos hooks do Fastify (erro do roteador, em `frameworkErrors`): sem eles, o navegador esconde do frontend o
 * corpo do erro. Mude os dois juntos.
 */
export function corsHeadersFor(origin: string | undefined): Record<string, string> {
  return {
    vary: "Origin",
    ...(origin !== undefined && allowedOrigins.has(origin) && { "access-control-allow-origin": origin }),
    "access-control-allow-credentials": "true",
  };
}

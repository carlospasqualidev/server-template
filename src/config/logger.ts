import { type FastifyServerOptions } from "fastify";

import { env } from "@/config/env";

/** Cabeçalhos que nunca vão para o log (sessão e credenciais). */
const REDACTED_PATHS = ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'];

/**
 * Logger do Fastify (pino). Silencioso em teste, legível em desenvolvimento (pino-pretty) e JSON em produção.
 */
export function buildLoggerOptions(): FastifyServerOptions["logger"] {
  if (env.isTest) {
    return false;
  }

  const level = env.LOG_LEVEL ?? (env.isProduction ? "info" : "debug");

  if (env.NODE_ENV === "development") {
    return {
      level,
      redact: REDACTED_PATHS,
      transport: {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
    };
  }

  return { level, redact: REDACTED_PATHS };
}

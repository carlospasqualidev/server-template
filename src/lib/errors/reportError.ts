import { env } from "@/config/env";

interface ErrorContext {
  requestId: string;
  method: string;
  url: string;
  /** ID opaco do usuário autenticado. Nunca envie nome, e-mail ou outro dado pessoal. */
  userId?: string;
}

/**
 * Envia erros 500 para o serviço externo de log (`ERROR_LOG_URL`), só em produção.
 * Nunca lança: falha no reporte não pode afetar a resposta ao cliente.
 */
export async function reportError(error: unknown, context: ErrorContext): Promise<void> {
  if (!env.isProduction || !env.ERROR_LOG_URL) {
    return;
  }

  const errorStack = error instanceof Error ? error.stack : String(error);

  try {
    await fetch(env.ERROR_LOG_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectName: env.PROJECT_NAME,
        environment: env.PROJECT_ENVIRONMENT,
        side: "Server",
        errorStack,
        extraInfo: context,
      }),
    });
  } catch {
    // Reporte e best-effort.
  }
}

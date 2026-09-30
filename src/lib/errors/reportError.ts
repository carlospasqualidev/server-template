import { env } from "@/config/env";
import { maskSearchInUrl } from "@/config/logger";

interface ErrorContext {
  requestId: string;
  method: string;
  /** Sai com a busca (`search`) mascarada, como no log de requisição. */
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
        extraInfo: { ...context, url: maskSearchInUrl(context.url) },
      }),
    });
  } catch {
    // Reporte e best-effort.
  }
}

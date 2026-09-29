import { requestContext } from "@fastify/request-context";
import { type FastifyRequest } from "fastify";

import { AUDIT_USER_AGENT_MAX_LENGTH } from "@/config/constants";

/**
 * Metadados da requisição que a trilha de auditoria grava junto de cada registro. Vivem no contexto da requisição
 * (`@fastify/request-context`, sobre `AsyncLocalStorage`, registrado em `app.ts`) e chegam a `recordAuditService` sem
 * passar pelas camadas, inclusive dentro de `prisma.$transaction`.
 *
 * Só a auditoria lê este contexto. Regra de negócio (tenant, autor de uma checagem, anti-escalonamento) recebe o que
 * precisa por argumento, nunca daqui.
 */
export interface AuditRequestMetadata {
  /** `request.id` do Fastify: o mesmo `reqId` dos logs do pino, para cruzar o registro com o log da requisição. */
  requestId: string;
  ip: string;
  userAgent: string | null;
  /** Usuário da sessão, preenchido por `requireSession`. Ausente em rota pública (login, register). */
  userId?: string;
}

/** Valor inicial do contexto, montado no `onRequest` de toda requisição (`app.ts`). */
export function buildAuditRequestMetadata(request: FastifyRequest): AuditRequestMetadata {
  const { "user-agent": userAgent } = request.headers;

  return {
    requestId: request.id,
    ip: request.ip,
    userAgent: userAgent ? userAgent.slice(0, AUDIT_USER_AGENT_MAX_LENGTH) : null,
  };
}

/** Chamado por `requireSession`: a partir daqui, todo registro de auditoria da requisição sai com este autor. */
export function setAuditActor(request: FastifyRequest, userId: string): void {
  const metadata = request.requestContext.get("audit");

  if (metadata) {
    request.requestContext.set("audit", { ...metadata, userId });
  }
}

/** Metadados da requisição em curso; `undefined` fora de uma (seed, script, teste que chama o service direto). */
export function getAuditRequestMetadata(): AuditRequestMetadata | undefined {
  return requestContext.get("audit");
}

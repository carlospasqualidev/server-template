import "@fastify/request-context";

import type { AuditRequestMetadata } from "@/lib/audit/auditContext";

declare module "@fastify/request-context" {
  interface RequestContextData {
    /** Metadados da requisição para a trilha de auditoria. Lidos só por `recordAuditService`. */
    audit: AuditRequestMetadata;
  }
}

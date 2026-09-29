import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, AUDIT_MODULE_LABELS } from "@/modules/audit/audit.catalog";

function toOptions(labels: ReadonlyMap<string, string>): { value: string; label: string }[] {
  return [...labels].map(([value, label]) => ({ value, label }));
}

/** Opções dos filtros da trilha, com o rótulo pt-BR de cada valor. Vem do catálogo em código, sem ir ao banco. */
export function listAuditLogOptionsService() {
  return {
    modules: toOptions(AUDIT_MODULE_LABELS),
    actions: toOptions(AUDIT_ACTION_LABELS),
    entities: toOptions(AUDIT_ENTITY_LABELS),
  };
}

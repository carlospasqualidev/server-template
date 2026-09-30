import { type AuditAction, type AuditModule } from "@/generated/prisma/client";

/**
 * Entidades auditadas: o `entity` gravado é o nome do model afetado. Entidade nova entra aqui; o compilador passa a
 * exigir o rótulo em `AUDIT_ENTITY_LABELS`, os campos com dado pessoal em `AUDIT_PERSONAL_FIELDS` e as frases da
 * entidade em `audit.descriptions.ts` (`AUDIT_DESCRIPTIONS` e os substantivos de `auditEntityNouns`).
 */
export const AUDIT_ENTITIES = ["User", "Role", "SystemConfig"] as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

/** Formatos de arquivo de uma exportação auditada (`recordExportAuditService`), como aparecem na trilha. */
export const AUDIT_EXPORT_FORMATS = ["CSV", "XLSX", "PDF"] as const;

export type AuditExportFormat = (typeof AUDIT_EXPORT_FORMATS)[number];

/** O `Record` obriga uma entrada para cada valor (enum ou entidade nova não compila sem ela); o código lê o `Map`. */
function toCatalogMap<TKey extends string, TValue>(entries: Record<TKey, TValue>): ReadonlyMap<TKey, TValue> {
  return new Map(Object.entries(entries) as [TKey, TValue][]);
}

/**
 * Rótulos pt-BR da trilha, fonte única: o frontend os recebe por `GET /audit-logs/options` e exibe o valor cru do que
 * não conhecer. A ordem aqui é a das opções.
 */
export const AUDIT_MODULE_LABELS = toCatalogMap<AuditModule, string>({
  USERS: "Usuários",
  SECURITY: "Segurança",
  SETTINGS: "Configurações",
});

export const AUDIT_ACTION_LABELS = toCatalogMap<AuditAction, string>({
  create: "Criação",
  update: "Edição",
  delete: "Exclusão",
  statusChange: "Mudança de status",
  login: "Login",
  export: "Exportação",
});

export const AUDIT_ENTITY_LABELS = toCatalogMap<AuditEntity, string>({
  User: "Usuário",
  Role: "Cargo",
  SystemConfig: "Configuração do sistema",
});

/**
 * Campos com dado pessoal (LGPD) de cada entidade. A trilha grava o valor deles em `before`/`after` (decisão do dono:
 * prova do que mudou e busca por conteúdo); este catálogo é o que a anonimização da retenção troca pelo marcador
 * (`AUDIT_REDACTED_VALUE`) quando o prazo vence ou o titular pede a eliminação. Segredo (senha, hash, token) é outra
 * coisa: nunca entra na trilha, sai em `pickAuditable`.
 */
export const AUDIT_PERSONAL_FIELDS = toCatalogMap<AuditEntity, readonly string[]>({
  User: ["name", "email", "phone", "image"],
  Role: [],
  SystemConfig: [],
});

import { type AuditAction, type AuditModule } from "@/generated/prisma/client";

/**
 * Entidades auditadas: o `entity` gravado é o nome do model afetado. Entidade nova entra aqui, com rótulo em
 * `AUDIT_ENTITY_LABELS` e os campos com dado pessoal em `AUDIT_PERSONAL_FIELDS` (o compilador exige os dois).
 */
export const AUDIT_ENTITIES = ["User", "Role", "SystemConfig"] as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

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
});

export const AUDIT_ENTITY_LABELS = toCatalogMap<AuditEntity, string>({
  User: "Usuário",
  Role: "Cargo",
  SystemConfig: "Configuração do sistema",
});

/**
 * Campos com dado pessoal (LGPD) de cada entidade: a trilha registra que mudaram (`changedFields`), com o valor trocado
 * pelo marcador em `before`/`after`. Segredo (senha, hash, token) nem chega a entrar: sai em `pickAuditable`.
 */
export const AUDIT_PERSONAL_FIELDS = toCatalogMap<AuditEntity, readonly string[]>({
  User: ["name", "email", "phone", "image"],
  Role: [],
  SystemConfig: [],
});

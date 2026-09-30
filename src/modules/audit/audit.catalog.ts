import { type AuditAction, type AuditModule, type Role, type SystemConfig, type User } from "@/generated/prisma/client";
import { type AuditMetadataField, type AuditValue } from "@/lib/audit/auditSnapshot";

/**
 * Entidades auditadas: o `entity` gravado é o nome do model afetado. Entidade nova entra aqui; o compilador passa a
 * exigir o rótulo em `AUDIT_ENTITY_LABELS`, o model e os campos montados em `AuditEntityModels` e
 * `AuditDerivedFields`, o rótulo de cada campo em `AUDIT_FIELD_LABELS`, os campos com dado pessoal em
 * `AUDIT_PERSONAL_FIELDS` e as frases da entidade em `audit.descriptions.ts` (`AUDIT_DESCRIPTIONS` e os substantivos
 * de `auditEntityNouns`).
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
 * Model de cada entidade auditada. Toda coluna dele, fora os metadados de linha (`AuditMetadataField`), é campo da
 * trilha: entra com o valor em `before`/`after` (a linha passa por `pickAuditable`) ou, se for segredo, só pelo nome
 * em `changedFields` (`password`). Coluna nova no model passa a exigir rótulo em `AUDIT_FIELD_LABELS`.
 */
interface AuditEntityModels {
  User: User;
  Role: Role;
  SystemConfig: SystemConfig;
}

/**
 * Campos que o estado da trilha monta além das colunas do model: listas gravadas como texto (`toAuditListText`) pelos
 * estados montados à mão (`toUserRolesAuditSnapshot`, `toRoleAuditSnapshot`). Estado novo com campo assim declara o
 * campo aqui e o confere com `satisfies AuditFieldValues<entidade>`.
 */
interface AuditDerivedFields {
  User: "roles";
  Role: "permissions";
  SystemConfig: never;
}

/** Campo da trilha de uma entidade: coluna do model (sem os metadados de linha) ou campo montado. */
export type AuditField<TEntity extends AuditEntity> =
  Exclude<keyof AuditEntityModels[TEntity] & string, AuditMetadataField> | AuditDerivedFields[TEntity];

/** Rótulo pt-BR de cada campo de cada entidade: o compilador recusa entidade ou campo sem rótulo, e campo a mais. */
type AuditFieldLabelCatalog = { readonly [TEntity in AuditEntity]: Readonly<Record<AuditField<TEntity>, string>> };

function toFieldLabelMap(catalog: AuditFieldLabelCatalog): ReadonlyMap<AuditEntity, ReadonlyMap<string, string>> {
  return new Map(
    (Object.entries(catalog) as [AuditEntity, Readonly<Record<string, string>>][]).map(([entity, labels]) => [
      entity,
      new Map(Object.entries(labels)),
    ]),
  );
}

/**
 * Rótulos pt-BR dos campos da trilha, fonte única, por entidade: o de→para do detalhe e da linha do tempo
 * (`fieldChanges`) sai com eles, e na ordem daqui (a ordem em que a tela mostra os campos). Inclui as colunas que o
 * estado de hoje não grava (último acesso, cargo de sistema, chave) e a senha, que aparece só pelo nome: passar a
 * gravar um campo não exige lembrar do rótulo.
 */
const FIELD_LABELS = {
  User: {
    name: "Nome",
    email: "E-mail",
    phone: "Telefone",
    image: "Foto",
    password: "Senha",
    isActive: "Ativo",
    idleTimeoutMinutes: "Tempo de inatividade (minutos)",
    roles: "Cargos",
    lastLoginAt: "Último acesso",
  },
  Role: {
    name: "Nome",
    description: "Descrição",
    permissions: "Permissões",
    isSystem: "Cargo de sistema",
  },
  SystemConfig: {
    key: "Chave",
    value: "Valor",
  },
} satisfies AuditFieldLabelCatalog;

export const AUDIT_FIELD_LABELS = toFieldLabelMap(FIELD_LABELS);

/**
 * Campo com rótulo em `AUDIT_FIELD_LABELS`: o único que a entrada da trilha (`AuditEntry<entidade>`) aceita em
 * `before`/`after`, `hiddenChangedFields` e `redactedFields`. Lido do próprio catálogo, então tirar um rótulo quebra
 * também quem grava o campo.
 */
export type AuditLabeledField<TEntity extends AuditEntity> = keyof (typeof FIELD_LABELS)[TEntity] & string;

/** Estado montado à mão para a trilha: só campos com rótulo (confira com `satisfies`, campo sem rótulo não compila). */
export type AuditFieldValues<TEntity extends AuditEntity> = Partial<Record<AuditLabeledField<TEntity>, AuditValue>>;

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

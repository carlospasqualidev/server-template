/** Valor guardado no `before`/`after` da trilha: só primitivos, que o frontend exibe como texto. */
export type AuditValue = string | number | boolean | null;

/** Estado de um registro na trilha de auditoria (`before` ou `after`). */
export type AuditSnapshot = Record<string, AuditValue>;

/**
 * Marcador que substitui um valor que a trilha não guarda: o de uma configuração secreta (`redactInAudit`), na
 * gravação, e o dos campos pessoais, quando a retenção anonimiza o registro. A trilha continua dizendo que o campo
 * mudou. `null` continua `null` (ausência de dado não é dado).
 */
export const AUDIT_REDACTED_VALUE = "[omitido]";

/**
 * Metadados de linha: já estão nas colunas do registro de auditoria (`entityId`, `companyId`, `createdAt`) ou não são
 * mudança de negócio (`updatedAt`, `deletedAt`: a exclusão é a própria ação `delete`).
 */
const AUDIT_METADATA_FIELDS = ["id", "companyId", "createdAt", "updatedAt", "deletedAt"] as const;

/** Coluna que nunca entra na trilha por ser metadado de linha; fica fora do catálogo de rótulos de campo. */
export type AuditMetadataField = (typeof AUDIT_METADATA_FIELDS)[number];

const METADATA_FIELDS: ReadonlySet<string> = new Set(AUDIT_METADATA_FIELDS);

/** Segredo nunca entra na trilha, em nenhuma entidade: senha, hash, token, segredo, com qualquer prefixo ou sufixo. */
const SECRET_FIELD_PATTERN = /password|hash|token|secret/i;

type AuditPrimitive = string | number | boolean;

function isAuditPrimitive(value: unknown): value is AuditPrimitive {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/**
 * Lista como a trilha a grava: texto (`"a, b"`), ou `null` quando vazia. Use no estado montado para a trilha
 * (`toRoleAuditSnapshot`, `toUserRolesAuditSnapshot`): só ali se sabe que a lista vazia é "nenhum" e não relação.
 */
export function toAuditListText(values: readonly AuditPrimitive[]): string | null {
  return values.length > 0 ? values.join(", ") : null;
}

/**
 * Aplaina para primitivo: data vira ISO, lista de primitivos vira texto (`"a, b"`); relação e objeto saem. A lista
 * vazia também sai: não dá para distinguir de uma relação vazia (`userRoles: []`).
 */
function toAuditValue(value: unknown): AuditValue | undefined {
  if (value === null || isAuditPrimitive(value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value) && value.length > 0 && value.every(isAuditPrimitive)) {
    return toAuditListText(value);
  }

  return undefined;
}

function isAuditableField(field: string): boolean {
  return !METADATA_FIELDS.has(field) && !SECRET_FIELD_PATTERN.test(field);
}

/**
 * Cura o `before`/`after` de um registro: tira segredos (`password`, hashes, tokens) e metadados de linha e aplaina os
 * valores para primitivos, descartando relações e objetos aninhados. Receba a linha inteira (o `select` da consulta):
 * o que não pode ir à trilha sai aqui, sem escolher campo a dedo no service. Sem objeto, `null`.
 */
export function pickAuditable(source: object | null | undefined): AuditSnapshot | null {
  if (!source) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(source).flatMap(([field, value]): [string, AuditValue][] => {
      const auditValue = isAuditableField(field) ? toAuditValue(value) : undefined;

      return auditValue === undefined ? [] : [[field, auditValue]];
    }),
  );
}

/**
 * Campos que mudaram entre `before` e `after`, já curados por `pickAuditable`. Vazio na criação, na exclusão e no
 * login (só um dos lados, ou nenhum, existe): o frontend destaca estes campos no detalhe.
 */
export function computeChangedFields(before: AuditSnapshot | null, after: AuditSnapshot | null): string[] {
  if (!before || !after) {
    return [];
  }

  const beforeValues = new Map(Object.entries(before));
  const afterValues = new Map(Object.entries(after));
  const fields = new Set([...beforeValues.keys(), ...afterValues.keys()]);

  return [...fields].filter((field) => beforeValues.get(field) !== afterValues.get(field));
}

/**
 * Troca pelo marcador o valor dos `fields`: configuração secreta na gravação (depois do diff), campos pessoais na
 * anonimização de um registro já gravado.
 */
export function redactAuditable(snapshot: AuditSnapshot | null, fields: ReadonlySet<string>): AuditSnapshot | null {
  if (!snapshot || fields.size === 0) {
    return snapshot;
  }

  return Object.fromEntries(
    Object.entries(snapshot).map(([field, value]): [string, AuditValue] => [
      field,
      value !== null && fields.has(field) ? AUDIT_REDACTED_VALUE : value,
    ]),
  );
}

/** Lê de volta o `before`/`after` gravado (coluna JSON): objeto de primitivos, ou `null`. */
export function toAuditSnapshot(value: unknown): AuditSnapshot | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return pickAuditable(value);
}

import { type AuditAction } from "@/generated/prisma/client";
import { AUDIT_REDACTED_VALUE, type AuditSnapshot, type AuditValue } from "@/lib/audit/auditSnapshot";
import { AUDIT_ENTITIES, AUDIT_FIELD_LABELS } from "@/modules/audit/audit.catalog";
import { lookupSystemConfigDefinition } from "@/modules/systemConfigs/systemConfig.catalog";

/**
 * Uma mudança legível de um campo: rótulo pt-BR e valores de → para já formatados. O backend é dono do rótulo e do
 * texto, como no sul-oxidos (`orderAuditFieldChanges.ts`): a tela só imprime `label`, `from` e `to`.
 */
export interface AuditFieldChange {
  /** Nome técnico do campo: chave estável para a tela, nunca exibida. */
  field: string;
  label: string;
  from: string;
  to: string;
}

/** O que o de→para lê de um registro da trilha, com `before`/`after` já lidos por `toAuditSnapshot`. */
interface AuditFieldChangesSource {
  entity: string;
  /** Id do registro afetado; na configuração, a chave, que dá o tipo do `value`. */
  entityId: string | null;
  action: AuditAction;
  changedFields: readonly string[];
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
}

/** Valor ausente, nulo ou texto vazio, como no histórico do sul-oxidos. */
export const AUDIT_EMPTY_VALUE = "[Vazio]";

/** Data civil, como o servidor a trafega (`AAAA-MM-DD`). */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Data e hora como `pickAuditable` grava um `Date` (`toISOString`: UTC, com milissegundos e `Z`). */
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Meia-noite UTC exata: é como `pickAuditable` grava a coluna `@db.Date` (data sem hora). */
const UTC_MIDNIGHT_SUFFIX = "T00:00:00.000Z";

/** Booleano de configuração como `serializeSystemConfigValue` o grava. */
const CONFIG_BOOLEAN_TEXTS = new Map([
  ["true", true],
  ["false", false],
]);

/** Número de configuração como `serializeSystemConfigValue` o grava (`String(número)`: `20`, `-1.5`). */
const CONFIG_NUMBER_PATTERN = /^-?\d+$|^-?\d+\.\d+$/;

function isEmptyAuditValue(value: AuditValue | undefined): value is null | undefined | "" {
  return value === undefined || value === null || value === "";
}

function isAuditDate(value: string): boolean {
  return (DATE_ONLY_PATTERN.test(value) || DATE_TIME_PATTERN.test(value)) && !Number.isNaN(Date.parse(value));
}

/**
 * `dd/mm/aaaa`, e `dd/mm/aaaa hh:mm` quando há hora, lidos do próprio texto: o ISO gravado já está em UTC, então a
 * data não "anda" um dia com o fuso de quem lê. Meia-noite UTC exata sai sem hora (data civil).
 */
function formatAuditDate(value: string): string {
  const date = `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;

  if (DATE_ONLY_PATTERN.test(value) || value.endsWith(UTC_MIDNIGHT_SUFFIX)) {
    return date;
  }

  return `${date} ${value.slice(11, 16)}`;
}

/**
 * Valor da trilha como a tela o mostra: ausente, nulo ou vazio → `[Vazio]`; booleano → `Sim`/`Não`; número com vírgula
 * decimal; data ISO → `dd/mm/aaaa` (com `hh:mm` quando há hora), em UTC; o resto, como está (inclusive `[omitido]`).
 */
export function formatAuditValue(value: AuditValue | undefined): string {
  if (isEmptyAuditValue(value)) {
    return AUDIT_EMPTY_VALUE;
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  if (typeof value === "number") {
    return String(value).replace(".", ",");
  }

  return isAuditDate(value) ? formatAuditDate(value) : value;
}

/** Campos com valor: na criação e na exclusão, o vazio dos dois lados (`[Vazio] → [Vazio]`) não diz nada e fica fora. */
function filledFields(snapshot: AuditSnapshot | null): string[] {
  return Object.entries(snapshot ?? {})
    .filter(([, value]) => !isEmptyAuditValue(value))
    .map(([field]) => field);
}

/**
 * Campos que o de→para mostra: os alterados na edição e na mudança de status; os que têm valor na criação (`after`) e
 * na exclusão (`before`); nenhum no login e na exportação (o `after` da exportação são filtros, não campos).
 */
function toShownFields({ action, changedFields, before, after }: AuditFieldChangesSource): readonly string[] {
  switch (action) {
    case "update":
    case "statusChange":
      return changedFields;
    case "create":
      return filledFields(after);
    case "delete":
      return filledFields(before);
    case "login":
    case "export":
      return [];
  }
}

/**
 * O `value` de configuração é gravado como texto (`"true"`, `"20"`): volta ao tipo da chave no catálogo, para sair
 * como `Sim`/`Não` ou número com vírgula. Chave que saiu do catálogo e texto que não é do tipo (`[omitido]`, valor de
 * antes de a chave mudar de tipo) saem como gravados: registro antigo nunca quebra a leitura.
 */
function toSystemConfigValue(key: string, text: string): AuditValue {
  switch (lookupSystemConfigDefinition(key)?.valueType) {
    case "boolean":
      return CONFIG_BOOLEAN_TEXTS.get(text) ?? text;
    case "int":
    case "float":
      return CONFIG_NUMBER_PATTERN.test(text) ? Number(text) : text;
    default:
      return text;
  }
}

/** Valor gravado no tipo em que se lê: só o `value` de configuração muda (texto → tipo da chave, pelo `entityId`). */
function toReadableValue(
  { entity, entityId }: AuditFieldChangesSource,
  field: string,
  value: AuditValue | undefined,
): AuditValue | undefined {
  if (entity === "SystemConfig" && field === "value" && entityId !== null && typeof value === "string") {
    return toSystemConfigValue(entityId, value);
  }

  return value;
}

/** Na ordem do catálogo; campo fora dele (registro antigo, entidade desconhecida) vai ao fim, na ordem gravada. */
function inCatalogOrder(fields: readonly string[], labels: ReadonlyMap<string, string>): string[] {
  const shown = new Set(fields);

  return [...[...labels.keys()].filter((field) => shown.has(field)), ...fields.filter((field) => !labels.has(field))];
}

/**
 * De→para legível de um registro da trilha: para cada campo, o rótulo pt-BR e os valores formatados. A trilha guarda o
 * valor cru (a prova do que mudou); a tradução acontece na leitura. Campo sem rótulo no catálogo sai com o nome
 * técnico, para não esconder a mudança. O `value` de configuração sai pelo tipo da chave. Sem resolução de id para
 * nome: um id de referência sai como está.
 */
export function toAuditFieldChanges(log: AuditFieldChangesSource): AuditFieldChange[] {
  const entity = AUDIT_ENTITIES.find((known) => known === log.entity);
  const labels = (entity && AUDIT_FIELD_LABELS.get(entity)) ?? new Map<string, string>();
  const before = new Map(Object.entries(log.before ?? {}));
  const after = new Map(Object.entries(log.after ?? {}));

  return inCatalogOrder(toShownFields(log), labels).map((field) => {
    // Segredo alterado (`hiddenChangedFields`, ex.: a senha) entra só pelo nome, sem valor em nenhum dos lados.
    const isHidden = !before.has(field) && !after.has(field);

    return {
      field,
      label: labels.get(field) ?? field,
      from: isHidden ? AUDIT_REDACTED_VALUE : formatAuditValue(toReadableValue(log, field, before.get(field))),
      to: isHidden ? AUDIT_REDACTED_VALUE : formatAuditValue(toReadableValue(log, field, after.get(field))),
    };
  });
}

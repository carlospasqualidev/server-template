import { z } from "zod";

import { IDLE_TIMEOUT_MINUTES_RANGE } from "@/config/constants";
import { emailSchema } from "@/lib/validation/schemas";
import {
  resolveSystemConfigValue,
  type SystemConfigDefinition,
  type SystemConfigValueByType,
} from "@/modules/systemConfigs/systemConfig.definition";

const IDLE_TIMEOUT_RANGE_MESSAGE = `Informe um valor de ${IDLE_TIMEOUT_MINUTES_RANGE.min} a ${IDLE_TIMEOUT_MINUTES_RANGE.max} minutos.`;

/** Faixas dos prazos de retenção da trilha de auditoria, em meses. A exclusão também precisa vir depois da anonimização. */
const AUDIT_ANONYMIZE_AFTER_MONTHS_RANGE = { min: 1, max: 120 } as const;
const AUDIT_DELETE_AFTER_MONTHS_RANGE = { min: 2, max: 240 } as const;

function monthsRule(range: { min: number; max: number }) {
  const message = `Informe um valor de ${range.min} a ${range.max} meses.`;

  return z.number().min(range.min, message).max(range.max, message);
}

/**
 * Fonte única das configurações de sistema, na ordem da tela (agrupe as chaves do mesmo `module`). Só o valor gravado
 * por cada empresa vai ao banco (`SystemConfig`); rótulo, tipo, padrão e regra ficam aqui. Chave nova aparece para
 * todas as empresas com o `defaultValue`, sem migration nem seed. Não renomeie uma `key`: o valor gravado fica
 * órfão e a empresa volta ao padrão.
 */
export const SYSTEM_CONFIG_CATALOG = [
  {
    key: "app.name",
    module: "GENERAL",
    label: "Nome da aplicação",
    description: "Nome exibido na interface e nas comunicações enviadas aos usuários.",
    valueType: "string",
    defaultValue: "Meu Produto",
    rule: z.string().trim().min(1, "Informe o nome.").max(120, "Use no máximo 120 caracteres."),
  },
  {
    key: "app.supportEmail",
    module: "GENERAL",
    label: "E-mail de suporte",
    description: "Endereço que os usuários veem para pedir ajuda.",
    valueType: "string",
    defaultValue: "suporte@example.com",
    rule: emailSchema,
    personalData: true,
  },
  {
    key: "security.idleTimeoutMinutes",
    module: "SECURITY",
    label: "Tempo de inatividade até o logout (min)",
    description:
      "Minutos sem atividade até a sessão ser encerrada no navegador. Vale para os usuários sem um tempo próprio no cadastro.",
    valueType: "int",
    defaultValue: 20,
    rule: z
      .number()
      .min(IDLE_TIMEOUT_MINUTES_RANGE.min, IDLE_TIMEOUT_RANGE_MESSAGE)
      .max(IDLE_TIMEOUT_MINUTES_RANGE.max, IDLE_TIMEOUT_RANGE_MESSAGE),
  },
  {
    key: "audit.anonymizeAfterMonths",
    module: "SECURITY",
    label: "Prazo para anonimizar a auditoria (meses)",
    description:
      "Meses até cada evento da auditoria perder o autor, o IP, o navegador e os dados pessoais registrados. O que foi feito continua no histórico.",
    valueType: "int",
    defaultValue: 12,
    rule: monthsRule(AUDIT_ANONYMIZE_AFTER_MONTHS_RANGE),
  },
  {
    key: "audit.deleteAfterMonths",
    module: "SECURITY",
    label: "Prazo para apagar a auditoria (meses)",
    description:
      "Meses até cada evento da auditoria ser apagado de vez. Precisa ser maior que o prazo para anonimizar.",
    valueType: "int",
    defaultValue: 60,
    rule: monthsRule(AUDIT_DELETE_AFTER_MONTHS_RANGE),
  },
  {
    key: "notifications.email",
    module: "NOTIFICATIONS",
    label: "Notificações por e-mail",
    description: "Envia por e-mail os avisos do sistema.",
    valueType: "boolean",
    defaultValue: true,
  },
] as const satisfies readonly SystemConfigDefinition[];

type SystemConfigCatalogEntry = (typeof SYSTEM_CONFIG_CATALOG)[number];

/** Chave válida. `getSystemConfigValueService` só aceita estas: chave fora do catálogo não compila. */
export type SystemConfigKey = SystemConfigCatalogEntry["key"];

/** Tipo do valor da chave, derivado do `valueType` dela no catálogo (`security.idleTimeoutMinutes` → `number`). */
export type SystemConfigValue<TKey extends SystemConfigKey> = SystemConfigValueByType[Extract<
  SystemConfigCatalogEntry,
  { key: TKey }
>["valueType"]];

/** Todas as chaves, na ordem do catálogo. */
export const SYSTEM_CONFIG_KEYS: readonly SystemConfigKey[] = SYSTEM_CONFIG_CATALOG.map((definition) => definition.key);

/**
 * Definição de um texto que pode não ser chave do catálogo, ou `undefined`: para quem lê chave gravada, como a trilha
 * de auditoria, onde um registro antigo guarda a chave de uma configuração que já saiu do catálogo.
 */
export function lookupSystemConfigDefinition(key: string): SystemConfigDefinition | undefined {
  return SYSTEM_CONFIG_CATALOG.find((candidate) => candidate.key === key);
}

/** Definição da chave. `key` vem do tipo do catálogo, então sempre existe. */
export function findSystemConfigDefinition(key: SystemConfigKey): SystemConfigDefinition {
  const definition = lookupSystemConfigDefinition(key);

  if (!definition) {
    throw new Error(`Configuração fora do catálogo: ${key}.`);
  }

  return definition;
}

/** Lê o valor tipado de uma chave, para a regra entre chaves. */
type SystemConfigValueReader = <TKey extends SystemConfigKey>(key: TKey) => SystemConfigValue<TKey>;

/** Regra que compara chaves entre si (a `rule` de cada definição só enxerga o próprio valor). */
export interface SystemConfigCrossKeyRule {
  /** Chaves que a regra lê. */
  keys: readonly SystemConfigKey[];
  /** Uma das `keys`: o erro do lote aponta para o item dela, e a mensagem abre com o rótulo dela. */
  reportOn: SystemConfigKey;
  /** Regra pt-BR, sem o valor recebido. */
  message: string;
  isSatisfied: (valueOf: SystemConfigValueReader) => boolean;
}

/**
 * Regras entre chaves. Valem sobre os valores **efetivos** da empresa depois do lote (o do lote, senão o gravado,
 * senão o padrão): o schema do `PATCH` confere as que têm todas as chaves no lote (400 com `issues`), e o service, com
 * a trava dos lotes da empresa, confere contra o valor já gravado as que o lote toca (400). Os padrões do catálogo
 * passam por todas (teste do catálogo).
 */
export const SYSTEM_CONFIG_CROSS_KEY_RULES: readonly SystemConfigCrossKeyRule[] = [
  {
    keys: ["audit.anonymizeAfterMonths", "audit.deleteAfterMonths"],
    reportOn: "audit.deleteAfterMonths",
    message: "Informe um valor maior que o prazo para anonimizar.",
    isSatisfied: (valueOf) => valueOf("audit.deleteAfterMonths") > valueOf("audit.anonymizeAfterMonths"),
  },
];

/** Mensagem de erro da regra: `<rótulo da chave apontada>: <regra>`, como a de uma chave só. */
export function crossKeyRuleMessage(rule: SystemConfigCrossKeyRule): string {
  return `${findSystemConfigDefinition(rule.reportOn).label}: ${rule.message}`;
}

/**
 * Leitor de valores a partir dos textos gravados ou enviados por chave: converte pelo tipo da chave e cai no padrão
 * quando a chave não tem texto (ou quando o texto não passa mais pela regra, como na leitura normal).
 */
export function systemConfigValueReader(texts: ReadonlyMap<string, string>): SystemConfigValueReader {
  // `resolveSystemConfigValue` converte pelo `valueType` desta mesma chave: o tipo é o que o catálogo declara.
  return <TKey extends SystemConfigKey>(key: TKey) =>
    resolveSystemConfigValue(findSystemConfigDefinition(key), texts.get(key)) as SystemConfigValue<TKey>;
}

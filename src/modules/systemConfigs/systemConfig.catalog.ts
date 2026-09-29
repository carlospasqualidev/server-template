import { z } from "zod";

import { IDLE_TIMEOUT_MINUTES_RANGE } from "@/config/constants";
import { emailSchema } from "@/lib/validation/schemas";
import {
  type SystemConfigDefinition,
  type SystemConfigValueByType,
} from "@/modules/systemConfigs/systemConfig.definition";

const IDLE_TIMEOUT_RANGE_MESSAGE = `Informe um valor de ${IDLE_TIMEOUT_MINUTES_RANGE.min} a ${IDLE_TIMEOUT_MINUTES_RANGE.max} minutos.`;

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
    // Pode ser o e-mail de uma pessoa: a trilha registra a mudança sem o endereço.
    redactInAudit: true,
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

/** Definição da chave. `key` vem do tipo do catálogo, então sempre existe. */
export function findSystemConfigDefinition(key: SystemConfigKey): SystemConfigDefinition {
  const definition = SYSTEM_CONFIG_CATALOG.find((candidate) => candidate.key === key);

  if (!definition) {
    throw new Error(`Configuração fora do catálogo: ${key}.`);
  }

  return definition;
}

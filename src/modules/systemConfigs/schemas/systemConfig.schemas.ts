import { z } from "zod";

import { SYSTEM_CONFIG_KEYS } from "@/modules/systemConfigs/systemConfig.catalog";
import { SYSTEM_CONFIG_MODULES, SYSTEM_CONFIG_VALUE_TYPES } from "@/modules/systemConfigs/systemConfig.definition";

/** Configuração na resposta: a definição do catálogo com o valor efetivo da empresa. */
export const systemConfigSchema = z.object({
  key: z.enum(SYSTEM_CONFIG_KEYS).describe("Chave estável, `<grupo>.<nome>`: é o que o `PATCH` recebe."),
  module: z.enum(SYSTEM_CONFIG_MODULES).describe("Grupo da tela."),
  label: z.string().describe("Rótulo do campo (pt-BR)."),
  description: z.string().describe("Texto de ajuda do campo (pt-BR)."),
  valueType: z
    .enum(SYSTEM_CONFIG_VALUE_TYPES)
    .describe("Tipo do valor: define o campo da tela e a validação na gravação."),
  value: z
    .string()
    .describe(
      "Valor efetivo, sempre como texto (`'true'`/`'false'`, `'20'`, JSON): o gravado pela empresa ou, sem gravação, o padrão.",
    ),
});

export const systemConfigListSchema = z
  .array(systemConfigSchema)
  .describe("Todas as configurações do catálogo, na ordem da tela (agrupadas por `module`). Sem paginação.");

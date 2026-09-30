import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { systemConfigListSchema } from "@/modules/systemConfigs/schemas/systemConfig.schemas";
import {
  crossKeyRuleMessage,
  findSystemConfigDefinition,
  SYSTEM_CONFIG_CROSS_KEY_RULES,
  SYSTEM_CONFIG_KEYS,
  systemConfigValueReader,
} from "@/modules/systemConfigs/systemConfig.catalog";
import { parseSystemConfigValue, serializeSystemConfigValue } from "@/modules/systemConfigs/systemConfig.definition";

/**
 * Item do lote. Valida o valor pelo tipo e pela regra da chave e o entrega já normalizado (`'020'` vira `'20'`, e-mail
 * em minúsculas, JSON compacto). A mensagem abre com o rótulo da configuração e nunca repete o valor recebido.
 */
const systemConfigItemSchema = z
  .object({
    key: z
      .enum(SYSTEM_CONFIG_KEYS, { message: "Configuração desconhecida." })
      .describe("Chave da configuração (a de `GET /system-configs`).")
      .meta({ examples: ["security.idleTimeoutMinutes"] }),
    value: z
      .string({ message: "Informe o valor da configuração como texto." })
      .describe(
        "Novo valor, sempre como texto: `'true'`/`'false'` em boolean, número com ponto decimal, JSON serializado.",
      )
      .meta({ examples: ["30"] }),
  })
  .transform((item, context) => {
    const definition = findSystemConfigDefinition(item.key);
    const parsed = parseSystemConfigValue(definition, item.value);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({ code: "custom", path: ["value"], message: `${definition.label}: ${issue.message}` });
      }

      return z.NEVER;
    }

    return { key: item.key, value: serializeSystemConfigValue(definition, parsed.data) };
  });

export const updateSystemConfigsBodySchema = z.object({
  items: z
    .array(systemConfigItemSchema, { message: "Informe as configurações a gravar." })
    .min(1, "Informe ao menos uma configuração.")
    .max(SYSTEM_CONFIG_KEYS.length, `Informe no máximo ${SYSTEM_CONFIG_KEYS.length} configurações.`)
    .superRefine((items, context) => {
      const seenKeys = new Set<string>();

      for (const [index, item] of items.entries()) {
        if (seenKeys.has(item.key)) {
          context.addIssue({
            code: "custom",
            path: [index, "key"],
            message: `${findSystemConfigDefinition(item.key).label}: a configuração aparece mais de uma vez.`,
          });
        }

        seenKeys.add(item.key);
      }

      // Regra entre chaves com todas as chaves no lote: o erro aponta para o item da chave da regra. A que depende de
      // valor já gravado fica para o service, que lê com a trava dos lotes da empresa.
      const batchValues = new Map(items.map((item) => [item.key, item.value]));

      for (const rule of SYSTEM_CONFIG_CROSS_KEY_RULES) {
        if (rule.keys.every((key) => batchValues.has(key)) && !rule.isSatisfied(systemConfigValueReader(batchValues))) {
          context.addIssue({
            code: "custom",
            path: [items.findIndex((item) => item.key === rule.reportOn), "value"],
            message: crossKeyRuleMessage(rule),
          });
        }
      }
    })
    .describe(
      "Configurações alteradas, cada chave uma vez. Todas são gravadas, ou nenhuma. Regras entre chaves (o prazo para apagar a auditoria maior que o para anonimizar) valem sobre o resultado: o valor do lote, senão o gravado, senão o padrão.",
    ),
});

export type UpdateSystemConfigsBody = z.infer<typeof updateSystemConfigsBodySchema>;

export const updateSystemConfigsResponseSchema = z.object({
  message: z.string(),
  systemConfigs: systemConfigListSchema,
});

export const updateSystemConfigsRouteSchema = {
  tags: ["SystemConfigs"],
  summary: "Grava configurações de sistema da empresa em lote",
  description:
    "Exige `backoffice.systemConfigs.update`. Grava numa transação todas as configurações enviadas, ou nenhuma: basta um item inválido (chave desconhecida, valor fora do tipo ou da regra da chave, chave repetida) para responder 400 sem gravar nada. Regra entre chaves: `audit.deleteAfterMonths` maior que `audit.anonymizeAfterMonths`, conferida no lote (400 com `issues` no item de `audit.deleteAfterMonths`) e contra o valor já gravado ou o padrão, quando o lote traz só uma das duas (400 só com `message`). Responde a lista completa, como `GET /system-configs`.",
  security: [{ cookieAuth: [] }],
  body: updateSystemConfigsBodySchema,
  response: {
    200: updateSystemConfigsResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
  },
};

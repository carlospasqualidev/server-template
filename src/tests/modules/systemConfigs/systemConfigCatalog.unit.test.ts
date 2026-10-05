import { describe, expect, it } from "vitest";

import {
  crossKeyRuleMessage,
  SYSTEM_CONFIG_CATALOG,
  SYSTEM_CONFIG_CROSS_KEY_RULES,
  SYSTEM_CONFIG_KEYS,
  systemConfigValueReader,
} from "@/modules/systemConfigs/systemConfig.catalog";
import {
  parseSystemConfigValue,
  resolveSystemConfigValue,
  serializeSystemConfigValue,
  SYSTEM_CONFIG_MODULES,
  type SystemConfigDefinition,
} from "@/modules/systemConfigs/systemConfig.definition";

/** Definições fora do catálogo, para os tipos que ainda não têm chave (`float`, `json`). */
const floatDefinition: SystemConfigDefinition = {
  key: "test.ratio",
  module: "GENERAL",
  label: "Proporção",
  description: "Só para teste.",
  valueType: "float",
  defaultValue: 0.5,
};

const jsonDefinition: SystemConfigDefinition = {
  key: "test.policy",
  module: "SECURITY",
  label: "Política",
  description: "Só para teste.",
  valueType: "json",
  defaultValue: { minLength: 8 },
};

function issueMessages(definition: SystemConfigDefinition, text: string): string[] {
  const parsed = parseSystemConfigValue(definition, text);

  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("SYSTEM_CONFIG_CATALOG", () => {
  it("tem as chaves iniciais, na ordem da tela", () => {
    expect(SYSTEM_CONFIG_KEYS).toEqual([
      "app.name",
      "app.supportEmail",
      "security.idleTimeoutMinutes",
      "audit.anonymizeAfterMonths",
      "audit.deleteAfterMonths",
      "notifications.email",
    ]);
  });

  it("não repete chave e segue <grupo>.<nomeCamelCase>", () => {
    expect(new Set(SYSTEM_CONFIG_KEYS).size).toBe(SYSTEM_CONFIG_KEYS.length);

    for (const definition of SYSTEM_CONFIG_CATALOG) {
      expect(definition.key).toMatch(/^[a-z]+\.[a-z][a-zA-Z]*$/);
      expect(definition.label).not.toBe("");
      expect(definition.description).not.toBe("");
    }
  });

  it("mantém as chaves de um grupo juntas, na ordem dos grupos", () => {
    const modules = SYSTEM_CONFIG_CATALOG.map((definition) => definition.module);
    const groupRuns = modules.filter((module, index) => index === 0 || module !== modules.at(index - 1));

    expect(groupRuns).toEqual(SYSTEM_CONFIG_MODULES.filter((module) => modules.includes(module)));
  });

  it("todo padrão passa pelo tipo e pela regra da própria chave", () => {
    for (const definition of SYSTEM_CONFIG_CATALOG) {
      const serialized = serializeSystemConfigValue(definition, definition.defaultValue);
      const parsed = parseSystemConfigValue(definition, serialized);

      expect(parsed.success, definition.key).toBe(true);
      expect(parsed.data).toEqual(definition.defaultValue);
    }
  });

  it("os padrões passam por todas as regras entre chaves, e cada regra aponta para uma das próprias chaves", () => {
    const defaults = systemConfigValueReader(new Map());

    for (const rule of SYSTEM_CONFIG_CROSS_KEY_RULES) {
      expect(rule.keys, rule.message).toContain(rule.reportOn);
      expect(rule.isSatisfied(defaults), rule.message).toBe(true);
    }
  });

  it("prazo para apagar a auditoria maior que o para anonimizar", () => {
    const [rule] = SYSTEM_CONFIG_CROSS_KEY_RULES;
    const reader = (anonymize: string, remove: string) =>
      systemConfigValueReader(
        new Map([
          ["audit.anonymizeAfterMonths", anonymize],
          ["audit.deleteAfterMonths", remove],
        ]),
      );

    expect(rule?.isSatisfied(reader("12", "13"))).toBe(true);
    expect(rule?.isSatisfied(reader("12", "12"))).toBe(false);
    expect(rule?.isSatisfied(reader("24", "12"))).toBe(false);
    expect(rule && crossKeyRuleMessage(rule)).toBe(
      "Prazo para apagar a auditoria (meses): Informe um valor maior que o prazo para anonimizar.",
    );
  });
});

describe("valor de configuração por tipo", () => {
  it("float aceita número com ponto e recusa vírgula ou texto", () => {
    expect(parseSystemConfigValue(floatDefinition, "-1.25").data).toBe(-1.25);
    expect(parseSystemConfigValue(floatDefinition, "3").data).toBe(3);
    expect(issueMessages(floatDefinition, "1,5")).toEqual(["Informe um número, com ponto como separador decimal."]);
    expect(issueMessages(floatDefinition, "1.")).toEqual(["Informe um número, com ponto como separador decimal."]);
    expect(issueMessages(floatDefinition, "abc")).toEqual(["Informe um número, com ponto como separador decimal."]);
  });

  it("json aceita JSON válido, grava compacto e recusa JSON malformado", () => {
    const parsed = parseSystemConfigValue(jsonDefinition, '{\n  "minLength": 10,\n  "requireNumber": true\n}');

    expect(parsed.data).toEqual({ minLength: 10, requireNumber: true });
    expect(serializeSystemConfigValue(jsonDefinition, parsed.data)).toBe('{"minLength":10,"requireNumber":true}');
    expect(issueMessages(jsonDefinition, '{"minLength": 10')).toEqual(["Informe um JSON válido."]);
    expect(issueMessages(jsonDefinition, "")).toEqual(["Informe um JSON válido."]);
  });

  it("mensagens não repetem o valor recebido", () => {
    for (const text of ["valor-secreto-1", "{valor-secreto-2"]) {
      for (const message of [...issueMessages(floatDefinition, text), ...issueMessages(jsonDefinition, text)]) {
        expect(message).not.toContain("valor-secreto");
      }
    }
  });

  it("valor gravado que não passa mais pela regra vale o padrão", () => {
    expect(resolveSystemConfigValue(jsonDefinition, "{quebrado")).toEqual({ minLength: 8 });
    expect(resolveSystemConfigValue(jsonDefinition, undefined)).toEqual({ minLength: 8 });
    expect(resolveSystemConfigValue(jsonDefinition, "[1,2]")).toEqual([1, 2]);
  });
});

import { z } from "zod";

import { MAX_SYSTEM_CONFIG_VALUE_LENGTH } from "@/config/constants";

/** Grupos da tela de configurações (um card por grupo). O frontend ordena e rotula os grupos que conhece. */
export const SYSTEM_CONFIG_MODULES = ["GENERAL", "SECURITY", "NOTIFICATIONS"] as const;

export type SystemConfigModule = (typeof SYSTEM_CONFIG_MODULES)[number];

/** Tipos de valor. O frontend escolhe o campo por eles (texto, número, switch, área de JSON). */
export const SYSTEM_CONFIG_VALUE_TYPES = ["string", "int", "float", "boolean", "json"] as const;

export type SystemConfigValueType = (typeof SYSTEM_CONFIG_VALUE_TYPES)[number];

/** Valor já convertido, por tipo: o que o código recebe de `getSystemConfigValueService`. */
export interface SystemConfigValueByType {
  string: string;
  int: number;
  float: number;
  boolean: boolean;
  json: unknown;
}

interface SystemConfigDefinitionOf<TType extends SystemConfigValueType> {
  /** Chave estável, `<grupo>.<nomeCamelCase>`. É o que o código e o `PATCH` usam: nunca renomeie. */
  key: `${string}.${string}`;
  module: SystemConfigModule;
  /** Rótulo do campo (pt-BR). Também abre a mensagem de erro de validação do valor. */
  label: string;
  /** Texto de ajuda do campo (pt-BR). */
  description: string;
  valueType: TType;
  /** Vale enquanto a empresa não gravar um valor. */
  defaultValue: SystemConfigValueByType[TType];
  /** Regra da chave sobre o valor já convertido (faixa, formato, tamanho). Sem ela, vale só o tipo. */
  rule?: z.ZodType<SystemConfigValueByType[TType], SystemConfigValueByType[TType]>;
  /**
   * O valor é secreto (ex.: chave de API, senha de integração): a trilha de auditoria registra que a chave mudou, com o
   * valor trocado por um marcador fixo em `before`/`after`. Dado pessoal (ex.: e-mail de uma pessoa) não é segredo e
   * não leva esta marca: leva `personalData`.
   */
  redactInAudit?: true;
  /**
   * O valor pode ser dado pessoal (ex.: o e-mail de uma pessoa): a trilha de auditoria grava o valor, como os campos
   * pessoais das entidades, e a anonimização (prazo da retenção ou pedido de titular) o troca por um marcador fixo em
   * `before`/`after`.
   */
  personalData?: true;
}

/** Definição de uma configuração. `valueType`, `defaultValue` e `rule` concordam entre si: `int` só aceita número. */
export type SystemConfigDefinition = {
  [TType in SystemConfigValueType]: SystemConfigDefinitionOf<TType>;
}[SystemConfigValueType];

type ValueParser<TType extends SystemConfigValueType> = z.ZodType<SystemConfigValueByType[TType], string>;

// Mensagens sem o valor recebido: quem monta a resposta prefixa o rótulo da configuração.
const valueText = z
  .string()
  .max(MAX_SYSTEM_CONFIG_VALUE_LENGTH, `Use no máximo ${MAX_SYSTEM_CONFIG_VALUE_LENGTH} caracteres.`);

const stringValue: ValueParser<"string"> = valueText;

// Até 15 dígitos: acima disso o número perde precisão no `Number`.
const intValue: ValueParser<"int"> = valueText.regex(/^-?\d{1,15}$/, "Informe um número inteiro.").transform(Number);

const floatValue: ValueParser<"float"> = valueText
  .regex(/^-?\d{1,15}$|^-?\d{1,15}\.\d{1,15}$/, "Informe um número, com ponto como separador decimal.")
  .transform(Number);

const booleanValue: ValueParser<"boolean"> = valueText
  .regex(/^(true|false)$/, "Use true ou false.")
  .transform((text) => text === "true");

const jsonValue: ValueParser<"json"> = valueText.transform((text, context) => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    context.addIssue({ code: "custom", message: "Informe um JSON válido." });

    return z.NEVER;
  }
});

function withRule<TValue>(
  parser: z.ZodType<TValue, string>,
  rule: z.ZodType<TValue, TValue> | undefined,
): z.ZodType<TValue, string> {
  return rule ? parser.pipe(rule) : parser;
}

/** Texto → valor tipado: converte pelo `valueType` e aplica a regra da chave. */
function valueSchemaFor(definition: SystemConfigDefinition): z.ZodType<unknown, string> {
  switch (definition.valueType) {
    case "string":
      return withRule(stringValue, definition.rule);
    case "int":
      return withRule(intValue, definition.rule);
    case "float":
      return withRule(floatValue, definition.rule);
    case "boolean":
      return withRule(booleanValue, definition.rule);
    case "json":
      return withRule(jsonValue, definition.rule);
  }
}

/** Valida o texto recebido pelo tipo e pela regra da configuração. As mensagens nunca repetem o valor. */
export function parseSystemConfigValue(
  definition: SystemConfigDefinition,
  text: string,
): z.ZodSafeParseResult<unknown> {
  return valueSchemaFor(definition).safeParse(text);
}

/** Valor tipado → texto gravado e devolvido pela API (`'true'`, `'20'`, JSON compacto). */
export function serializeSystemConfigValue(definition: SystemConfigDefinition, value: unknown): string {
  return definition.valueType === "json" ? JSON.stringify(value) : String(value);
}

/**
 * Valor efetivo da configuração: o gravado, quando ainda passa pelo tipo e pela regra; senão o padrão. O gravado só
 * deixa de passar quando a regra da chave é endurecida depois da gravação: vale o padrão até a empresa gravar de novo.
 */
export function resolveSystemConfigValue(definition: SystemConfigDefinition, storedValue: string | undefined): unknown {
  if (storedValue === undefined) {
    return definition.defaultValue;
  }

  const parsed = parseSystemConfigValue(definition, storedValue);

  return parsed.success ? parsed.data : definition.defaultValue;
}

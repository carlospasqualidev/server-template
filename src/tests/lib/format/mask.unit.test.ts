import { describe, expect, it } from "vitest";

import { decimalFromPtBr, decimalToPtBr, mask, onlyDigits } from "@/lib/format";

/** O Intl separa `Rimport { describe, expect, it } from "vitest";

import { decimalFromPtBr, decimalToPtBr, mask, onlyDigits } from "@/lib/format";

 do valor com espaço não separável; normalizamos para comparar. */
const NON_BREAKING_SPACE = String.fromCharCode(160);

describe("mask", () => {
  it("formata CPF, CNPJ, CEP e telefone a partir dos dígitos", () => {
    expect(mask("CPF", "12345678901")).toBe("123.456.789-01");
    expect(mask("CNPJ", "12345678000190")).toBe("12.345.678/0001-90");
    expect(mask("CEP", "88000000")).toBe("88000-000");
    expect(mask("PHONE", "48999999999")).toBe("(48) 99999-9999");
    expect(mask("PHONE", "4833334444")).toBe("(48) 3333-4444");
  });

  it("formata moeda a partir de centavos", () => {
    expect(mask("BRL", 123456).replaceAll(NON_BREAKING_SPACE, " ")).toBe("R$ 1.234,56");
    expect(mask("BRL", "").replaceAll(NON_BREAKING_SPACE, " ")).toBe("R$ 0,00");
  });

  it("ignora caracteres que não são dígitos na entrada", () => {
    expect(mask("CPF", "123.456.789-01")).toBe("123.456.789-01");
  });
});

describe("unmask", () => {
  it("onlyDigits remove máscara", () => {
    expect(onlyDigits("(48) 99999-9999")).toBe("48999999999");
  });

  it("converte decimal entre pt-BR e formato numérico", () => {
    expect(decimalFromPtBr("1.234,56")).toBe("1234.56");
    expect(decimalToPtBr("1234.56")).toBe("1234,56");
    expect(decimalToPtBr(10.5)).toBe("10,5");
  });
});

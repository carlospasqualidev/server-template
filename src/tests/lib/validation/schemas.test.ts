import { describe, expect, it } from "vitest";

import { cepSchema, cnpjSchema, cpfSchema, emailSchema, imageUrlSchema, phoneSchema } from "@/lib/validation/schemas";

describe("emailSchema", () => {
  it("normaliza espaços e maiúsculas antes de validar", () => {
    expect(emailSchema.parse("  Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("rejeita formato inválido com mensagem em pt-BR", () => {
    const result = emailSchema.safeParse("ana@");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("O e-mail deve possuir o formato email@example.com.");
  });
});

describe("documentos brasileiros", () => {
  it.each(["(48) 99999-9999", "48 3333-4444", "48999999999", "(11)91234-5678"])("phoneSchema aceita %s", (value) => {
    expect(phoneSchema.safeParse(value).success).toBe(true);
  });

  it.each(["123", "abc", "(48) 999-99"])("phoneSchema rejeita %s", (value) => {
    expect(phoneSchema.safeParse(value).success).toBe(false);
  });

  it("cpfSchema aceita com e sem máscara", () => {
    expect(cpfSchema.safeParse("123.456.789-01").success).toBe(true);
    expect(cpfSchema.safeParse("12345678901").success).toBe(true);
    expect(cpfSchema.safeParse("1234567890").success).toBe(false);
  });

  it("cnpjSchema aceita com e sem máscara", () => {
    expect(cnpjSchema.safeParse("12.345.678/0001-90").success).toBe(true);
    expect(cnpjSchema.safeParse("12345678000190").success).toBe(true);
    expect(cnpjSchema.safeParse("12.345.678/0001").success).toBe(false);
  });

  it("cepSchema aceita com e sem hífen", () => {
    expect(cepSchema.safeParse("88000-000").success).toBe(true);
    expect(cepSchema.safeParse("88000000").success).toBe(true);
    expect(cepSchema.safeParse("8800-000").success).toBe(false);
  });
});

describe("imageUrlSchema", () => {
  const HTTPS_PREFIX = "https://cdn.example.com/";

  it("aceita a URL https do upload, até 2048 caracteres", () => {
    expect(imageUrlSchema.safeParse("https://bucket.s3.sa-east-1.amazonaws.com/uploads/foto.png").success).toBe(true);
    expect(imageUrlSchema.safeParse(`${HTTPS_PREFIX}${"a".repeat(2048 - HTTPS_PREFIX.length)}`).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,iVBORw0KGgo=",
    "http://cdn.example.com/foto.png",
    "ftp://cdn.example.com/foto.png",
    "nao-e-url",
  ])("recusa %s com mensagem em pt-BR", (value) => {
    const result = imageUrlSchema.safeParse(value);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["A imagem deve ser uma URL https válida."]);
  });

  it("recusa acima de 2048 caracteres sem analisar a URL", () => {
    const result = imageUrlSchema.safeParse(`${HTTPS_PREFIX}${"a".repeat(2049 - HTTPS_PREFIX.length)}`);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "A URL da imagem deve ter no máximo 2048 caracteres.",
    ]);
  });
});

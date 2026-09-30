import { describe, expect, it } from "vitest";

import { dateTimeQuerySchema, toContainsLikePattern } from "@/lib/http/query";

describe("toContainsLikePattern", () => {
  it("envolve o termo em `%` para 'contém'", () => {
    expect(toContainsLikePattern("maria")).toBe("%maria%");
  });

  it("escapa `%`, `_` e a barra: o termo casa como texto literal", () => {
    expect(toContainsLikePattern("50%")).toBe("%50\\%%");
    expect(toContainsLikePattern("app_name")).toBe("%app\\_name%");
    expect(toContainsLikePattern("C:\\temp")).toBe("%C:\\\\temp%");
  });
});

describe("dateTimeQuerySchema", () => {
  it("aceita ISO 8601 em UTC e devolve Date", () => {
    expect(dateTimeQuerySchema.parse("2026-09-01T03:00:00.000Z")).toEqual(new Date("2026-09-01T03:00:00.000Z"));
  });

  it("ausente vira undefined", () => {
    expect(dateTimeQuerySchema.parse(undefined)).toBeUndefined();
  });

  it.each(["2026-09-01", "2026-09-01T03:00:00-03:00", "ontem"])("recusa %s", (value) => {
    const result = dateTimeQuerySchema.safeParse(value);

    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.message).toBe("Data e hora inválidas. Use ISO 8601 em UTC.");
  });
});

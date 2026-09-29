import { describe, expect, it } from "vitest";

import { dateTimeQuerySchema, toDateTimeRangeFilter } from "@/lib/http/query";

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

describe("toDateTimeRangeFilter", () => {
  const from = new Date("2026-09-01T03:00:00.000Z");
  const to = new Date("2026-09-02T02:59:59.999Z");

  it("inclusivo nas duas pontas", () => {
    expect(toDateTimeRangeFilter(from, to)).toEqual({ gte: from, lte: to });
  });

  it("só uma das pontas", () => {
    expect(toDateTimeRangeFilter(from, undefined)).toEqual({ gte: from });
    expect(toDateTimeRangeFilter(undefined, to)).toEqual({ lte: to });
  });

  it("sem pontas não filtra", () => {
    expect(toDateTimeRangeFilter(undefined, undefined)).toBeUndefined();
  });
});

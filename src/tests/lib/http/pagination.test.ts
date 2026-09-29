import { describe, expect, it } from "vitest";

import { paginationQuerySchema, sortQuerySchema, toSkipTake } from "@/lib/http/pagination";
import { booleanQuerySchema, csvQuerySchema, searchQuerySchema } from "@/lib/http/query";

describe("paginationQuerySchema", () => {
  it("aplica padrões 0-based e converte strings da query", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 0, pageSize: 50 });
    expect(paginationQuerySchema.parse({ page: "2", pageSize: "10" })).toEqual({ page: 2, pageSize: 10 });
  });

  it("rejeita página negativa e pageSize acima do máximo", () => {
    expect(paginationQuerySchema.safeParse({ page: "-1" }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });

  it("toSkipTake traduz página em skip/take", () => {
    expect(toSkipTake({ page: 3, pageSize: 20 })).toEqual({ skip: 60, take: 20 });
  });
});

describe("sortQuerySchema", () => {
  const schema = sortQuerySchema(["name", "createdAt"], { orderBy: "createdAt", order: "desc" });

  it("usa o padrão e aceita só campos da allowlist", () => {
    expect(schema.parse({})).toEqual({ orderBy: "createdAt", order: "desc" });
    expect(schema.parse({ orderBy: "name", order: "asc" })).toEqual({ orderBy: "name", order: "asc" });
    expect(schema.safeParse({ orderBy: "password" }).success).toBe(false);
  });
});

describe("query helpers", () => {
  it("searchQuerySchema transforma vazio em undefined", () => {
    expect(searchQuerySchema.parse("  ")).toBeUndefined();
    expect(searchQuerySchema.parse(" ana ")).toBe("ana");
  });

  it("booleanQuerySchema converte true/false e mantém ausente", () => {
    expect(booleanQuerySchema.parse("true")).toBe(true);
    expect(booleanQuerySchema.parse("false")).toBe(false);
    expect(booleanQuerySchema.parse(undefined)).toBeUndefined();
    expect(booleanQuerySchema.safeParse("sim").success).toBe(false);
  });

  it("csvQuerySchema separa por vírgula e ignora vazios", () => {
    expect(csvQuerySchema.parse("a, b,,c")).toEqual(["a", "b", "c"]);
    expect(csvQuerySchema.parse("")).toBeUndefined();
  });
});

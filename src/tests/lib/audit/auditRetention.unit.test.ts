import { describe, expect, it } from "vitest";

import { auditRetentionCutoff } from "@/lib/audit/auditRetention";

describe("auditRetentionCutoff", () => {
  it("volta meses do calendário, com a mesma hora, em UTC", () => {
    expect(auditRetentionCutoff(new Date("2026-09-15T03:00:00.000Z"), 12)).toEqual(
      new Date("2025-09-15T03:00:00.000Z"),
    );
    expect(auditRetentionCutoff(new Date("2026-01-10T23:30:00.000Z"), 1)).toEqual(new Date("2025-12-10T23:30:00.000Z"));
    expect(auditRetentionCutoff(new Date("2026-09-15T03:00:00.000Z"), 60)).toEqual(
      new Date("2021-09-15T03:00:00.000Z"),
    );
  });

  it("dia que não existe no mês de destino vira o último dia dele", () => {
    expect(auditRetentionCutoff(new Date("2026-03-31T03:00:00.000Z"), 1)).toEqual(new Date("2026-02-28T03:00:00.000Z"));
    expect(auditRetentionCutoff(new Date("2028-03-31T03:00:00.000Z"), 1)).toEqual(new Date("2028-02-29T03:00:00.000Z"));
    expect(auditRetentionCutoff(new Date("2026-10-31T03:00:00.000Z"), 1)).toEqual(new Date("2026-09-30T03:00:00.000Z"));
  });

  it("não altera a data recebida", () => {
    const now = new Date("2026-09-15T03:00:00.000Z");

    auditRetentionCutoff(now, 3);

    expect(now).toEqual(new Date("2026-09-15T03:00:00.000Z"));
  });
});

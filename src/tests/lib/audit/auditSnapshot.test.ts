import { describe, expect, it } from "vitest";

import {
  AUDIT_REDACTED_VALUE,
  computeChangedFields,
  pickAuditable,
  redactAuditable,
  toAuditListText,
  toAuditSnapshot,
} from "@/lib/audit/auditSnapshot";

describe("pickAuditable", () => {
  it("tira segredos (senha, hash, token, segredo) e metadados de linha", () => {
    const snapshot = pickAuditable({
      id: "u1",
      companyId: "c1",
      name: "Ana",
      password: "$2b$12$hash",
      passwordHash: "$2b$12$hash",
      resetToken: "abc",
      refreshToken: "def",
      twoFactorSecret: "ghi",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      deletedAt: null,
      isActive: true,
    });

    expect(snapshot).toEqual({ name: "Ana", isActive: true });
  });

  it("aplaina para primitivos: data vira ISO, lista de primitivos vira texto e relação sai", () => {
    const snapshot = pickAuditable({
      lastSeenAt: new Date("2026-09-29T12:00:00.000Z"),
      permissions: ["backoffice.users.read", "backoffice.roles.read"],
      limit: 20,
      phone: null,
      userRoles: [{ role: { name: "Suporte" } }],
      company: { name: "Empresa" },
      missing: undefined,
    });

    expect(snapshot).toEqual({
      lastSeenAt: "2026-09-29T12:00:00.000Z",
      permissions: "backoffice.users.read, backoffice.roles.read",
      limit: 20,
      phone: null,
    });
  });

  it("relação vazia sai, em vez de virar null", () => {
    const snapshot = pickAuditable({ name: "Ana", userRoles: [], rolePermissions: [] });

    expect(snapshot).toEqual({ name: "Ana" });
  });

  it("lista montada para a trilha: texto, ou null quando vazia", () => {
    expect(toAuditListText(["Financeiro", "Suporte"])).toBe("Financeiro, Suporte");
    expect(toAuditListText([])).toBeNull();
    expect(pickAuditable({ roles: toAuditListText([]) })).toEqual({ roles: null });
  });

  it("sem objeto devolve null", () => {
    expect(pickAuditable(null)).toBeNull();
    expect(pickAuditable(undefined)).toBeNull();
  });
});

describe("computeChangedFields", () => {
  it("lista os campos com valor diferente, inclusive os que só existem de um lado", () => {
    expect(
      computeChangedFields(
        { name: "Ana", isActive: true, phone: null, legacy: "x" },
        { name: "Ana Maria", isActive: true, phone: "48999999999", extra: 1 },
      ),
    ).toEqual(["name", "phone", "legacy", "extra"]);
  });

  it("lista de primitivos que fica vazia: o campo entra nos alterados e a chave sai do depois", () => {
    const before = pickAuditable({ name: "Ana", tags: ["vip", "novo"] });
    const after = pickAuditable({ name: "Ana", tags: [] });

    expect(before).toEqual({ name: "Ana", tags: "vip, novo" });
    expect(after).toEqual({ name: "Ana" });
    expect(after).not.toHaveProperty("tags");
    expect(computeChangedFields(before, after)).toEqual(["tags"]);
  });

  it("vazio na criação, na exclusão, no login e quando nada muda", () => {
    expect(computeChangedFields(null, { name: "Ana" })).toEqual([]);
    expect(computeChangedFields({ name: "Ana" }, null)).toEqual([]);
    expect(computeChangedFields(null, null)).toEqual([]);
    expect(computeChangedFields({ name: "Ana" }, { name: "Ana" })).toEqual([]);
  });
});

describe("redactAuditable", () => {
  it("troca pelo marcador o valor dos campos informados e mantém null", () => {
    expect(redactAuditable({ email: "ana@example.com", phone: null, isActive: true }, new Set(["email", "phone"]))).toEqual(
      { email: AUDIT_REDACTED_VALUE, phone: null, isActive: true },
    );
  });

  it("sem campos ou sem objeto devolve o que recebeu", () => {
    const snapshot = { name: "Suporte" };

    expect(redactAuditable(snapshot, new Set())).toBe(snapshot);
    expect(redactAuditable(null, new Set(["name"]))).toBeNull();
  });
});

describe("toAuditSnapshot", () => {
  it("lê o objeto gravado e recusa o que não é objeto", () => {
    expect(toAuditSnapshot({ value: "30" })).toEqual({ value: "30" });
    expect(toAuditSnapshot(null)).toBeNull();
    expect(toAuditSnapshot("texto")).toBeNull();
    expect(toAuditSnapshot([1, 2])).toBeNull();
  });
});

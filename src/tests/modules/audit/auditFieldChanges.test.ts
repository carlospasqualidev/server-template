import { describe, expect, it } from "vitest";

import { type AuditAction } from "@/generated/prisma/client";
import { type AuditSnapshot } from "@/lib/audit/auditSnapshot";
import { AUDIT_ENTITIES, AUDIT_FIELD_LABELS, type AuditFieldValues } from "@/modules/audit/audit.catalog";
import { AUDIT_EMPTY_VALUE, formatAuditValue, toAuditFieldChanges } from "@/modules/audit/audit.fieldChanges";
import { type AuditEntry } from "@/modules/audit/services/recordAudit.service";

interface LogOverrides {
  entity?: string;
  entityId?: string | null;
  action?: AuditAction;
  changedFields?: string[];
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
}

function log(overrides: LogOverrides) {
  return {
    entity: "User",
    entityId: null,
    action: "update" as AuditAction,
    changedFields: [],
    before: null,
    after: null,
    ...overrides,
  };
}

describe("AUDIT_FIELD_LABELS", () => {
  it("toda entidade do catálogo tem rótulos de campo, sem repetição dentro dela", () => {
    for (const entity of AUDIT_ENTITIES) {
      const labels = [...(AUDIT_FIELD_LABELS.get(entity)?.values() ?? [])];

      expect(labels.length).toBeGreaterThan(0);
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    }
  });

  it("rotula os campos que as mutações gravam, inclusive os montados (cargos, permissões) e a senha", () => {
    expect(Object.fromEntries(AUDIT_FIELD_LABELS.get("User") ?? [])).toMatchObject({
      name: "Nome",
      email: "E-mail",
      phone: "Telefone",
      image: "Foto",
      password: "Senha",
      isActive: "Ativo",
      idleTimeoutMinutes: "Tempo de inatividade (minutos)",
      roles: "Cargos",
    });
    expect(Object.fromEntries(AUDIT_FIELD_LABELS.get("Role") ?? [])).toMatchObject({
      name: "Nome",
      description: "Descrição",
      permissions: "Permissões",
    });
    expect(Object.fromEntries(AUDIT_FIELD_LABELS.get("SystemConfig") ?? [])).toMatchObject({ value: "Valor" });
  });

  it("metadados de linha não são campo da trilha", () => {
    const fields = AUDIT_ENTITIES.flatMap((entity) => [...(AUDIT_FIELD_LABELS.get(entity)?.keys() ?? [])]);

    for (const metadata of ["id", "companyId", "createdAt", "updatedAt", "deletedAt"]) {
      expect(fields).not.toContain(metadata);
    }
  });

  it("estado montado à mão só aceita campo com rótulo (conferido pelo compilador)", () => {
    const labeled = { name: "Financeiro", permissions: null } satisfies AuditFieldValues<"Role">;
    const unlabeled = {
      name: "Financeiro",
      // @ts-expect-error campo sem rótulo em `AUDIT_FIELD_LABELS` não compila
      nickname: "Fin",
    } satisfies AuditFieldValues<"Role">;

    expect(labeled.name).toBe("Financeiro");
    expect(unlabeled.nickname).toBe("Fin");
  });

  it("a entrada da trilha só aceita campo com rótulo da entidade, sem `satisfies` (conferido pelo compilador)", () => {
    const entry: AuditEntry<"User"> = {
      companyId: "empresa",
      module: "SECURITY",
      entity: "User",
      entityId: "usuario",
      action: "statusChange",
      description: 'Bloqueou o usuário "Ana".',
      before: { isActive: true },
      after: {
        isActive: false,
        // @ts-expect-error campo sem rótulo de `User` não compila no estado escrito na entrada
        blockedReason: "Férias",
      },
      // @ts-expect-error nem como segredo alterado
      hiddenChangedFields: ["pin"],
    };
    const roleFieldOnUser: AuditEntry<"User"> = {
      ...entry,
      // @ts-expect-error campo de outra entidade (`permissions` é de `Role`) também não
      before: { permissions: "backoffice.users.read" },
    };

    expect(entry.after).toMatchObject({ isActive: false });
    expect(roleFieldOnUser.entity).toBe("User");
  });
});

describe("formatAuditValue", () => {
  it("ausente, nulo ou vazio vira `[Vazio]`", () => {
    expect(formatAuditValue(undefined)).toBe(AUDIT_EMPTY_VALUE);
    expect(formatAuditValue(null)).toBe("[Vazio]");
    expect(formatAuditValue("")).toBe("[Vazio]");
  });

  it("booleano vira Sim/Não", () => {
    expect(formatAuditValue(true)).toBe("Sim");
    expect(formatAuditValue(false)).toBe("Não");
  });

  it("número sai com vírgula decimal", () => {
    expect(formatAuditValue(45)).toBe("45");
    expect(formatAuditValue(10.5)).toBe("10,5");
    expect(formatAuditValue(-0.25)).toBe("-0,25");
    expect(formatAuditValue(0)).toBe("0");
  });

  it("data ISO sai em dd/mm/aaaa, com hh:mm quando há hora, em UTC", () => {
    expect(formatAuditValue("2026-08-03")).toBe("03/08/2026");
    expect(formatAuditValue("2026-08-03T14:05:09.123Z")).toBe("03/08/2026 14:05");
    // 23h30 em UTC continua no dia 03, qualquer que seja o fuso de quem lê.
    expect(formatAuditValue("2026-08-03T23:30:00.000Z")).toBe("03/08/2026 23:30");
    // Meia-noite UTC exata é como a coluna de data sem hora chega à trilha.
    expect(formatAuditValue("2026-08-03T00:00:00.000Z")).toBe("03/08/2026");
  });

  it("texto sai como está, inclusive `[omitido]`, número em texto e o que só parece data", () => {
    expect(formatAuditValue("Maria Alves")).toBe("Maria Alves");
    expect(formatAuditValue("[omitido]")).toBe("[omitido]");
    expect(formatAuditValue("1.5")).toBe("1.5");
    expect(formatAuditValue("2026-08-03 reunião")).toBe("2026-08-03 reunião");
    expect(formatAuditValue("2026-08-03T14:05")).toBe("2026-08-03T14:05");
    expect(formatAuditValue("0000-99-99")).toBe("0000-99-99");
  });
});

describe("toAuditFieldChanges", () => {
  it("edição: só os campos alterados, na ordem do catálogo, com rótulo e valores formatados", () => {
    const changes = toAuditFieldChanges(
      log({
        changedFields: ["idleTimeoutMinutes", "phone", "name"],
        before: { name: "Maria", email: "maria@example.com", phone: null, idleTimeoutMinutes: 30 },
        after: { name: "Maria Alves", email: "maria@example.com", phone: "48999999999", idleTimeoutMinutes: 90 },
      }),
    );

    expect(changes).toEqual([
      { field: "name", label: "Nome", from: "Maria", to: "Maria Alves" },
      { field: "phone", label: "Telefone", from: "[Vazio]", to: "48999999999" },
      { field: "idleTimeoutMinutes", label: "Tempo de inatividade (minutos)", from: "30", to: "90" },
    ]);
  });

  it("mudança de status: `Ativo: Sim → Não`", () => {
    const changes = toAuditFieldChanges(
      log({
        action: "statusChange",
        changedFields: ["isActive"],
        before: { isActive: true },
        after: { isActive: false },
      }),
    );

    expect(changes).toEqual([{ field: "isActive", label: "Ativo", from: "Sim", to: "Não" }]);
  });

  it("criação: os campos gravados com valor, com `from` = `[Vazio]`; o vazio dos dois lados fica fora", () => {
    const changes = toAuditFieldChanges(
      log({
        action: "create",
        after: { isActive: true, name: "Ana", image: null, phone: "", idleTimeoutMinutes: 15 },
      }),
    );

    expect(changes).toEqual([
      { field: "name", label: "Nome", from: "[Vazio]", to: "Ana" },
      { field: "isActive", label: "Ativo", from: "[Vazio]", to: "Sim" },
      { field: "idleTimeoutMinutes", label: "Tempo de inatividade (minutos)", from: "[Vazio]", to: "15" },
    ]);
  });

  it("exclusão: os campos do antes com valor, com `to` = `[Vazio]`; o vazio dos dois lados fica fora", () => {
    const changes = toAuditFieldChanges(
      log({
        entity: "Role",
        action: "delete",
        before: { permissions: "backoffice.users.read", description: null, name: "Suporte", isSystem: false },
      }),
    );

    expect(changes).toEqual([
      { field: "name", label: "Nome", from: "Suporte", to: "[Vazio]" },
      { field: "permissions", label: "Permissões", from: "backoffice.users.read", to: "[Vazio]" },
      // `false` é valor, não vazio.
      { field: "isSystem", label: "Cargo de sistema", from: "Não", to: "[Vazio]" },
    ]);
  });

  it("login e exportação não têm de→para", () => {
    expect(toAuditFieldChanges(log({ action: "login" }))).toEqual([]);
    expect(
      toAuditFieldChanges(log({ action: "export", after: { busca: "ana", formato: "CSV" }, changedFields: [] })),
    ).toEqual([]);
  });

  it("segredo alterado (a senha) aparece só como `[omitido]` dos dois lados", () => {
    const changes = toAuditFieldChanges(
      log({ changedFields: ["name", "password"], before: { name: "Ana" }, after: { name: "Ana Souza" } }),
    );

    expect(changes).toEqual([
      { field: "name", label: "Nome", from: "Ana", to: "Ana Souza" },
      { field: "password", label: "Senha", from: "[omitido]", to: "[omitido]" },
    ]);
  });

  it("valor anonimizado ou secreto (`[omitido]`) sai como está", () => {
    const changes = toAuditFieldChanges(
      log({ changedFields: ["email"], before: { email: "[omitido]" }, after: { email: "[omitido]" } }),
    );

    expect(changes).toEqual([{ field: "email", label: "E-mail", from: "[omitido]", to: "[omitido]" }]);
  });

  describe("configuração: o valor gravado em texto sai pelo `valueType` da chave (`entityId`)", () => {
    function configChange(entityId: string, before: string, after: string) {
      return toAuditFieldChanges(
        log({
          entity: "SystemConfig",
          entityId,
          changedFields: ["value"],
          before: { value: before },
          after: { value: after },
        }),
      );
    }

    it("booleano vira Sim/Não", () => {
      expect(configChange("notifications.email", "true", "false")).toEqual([
        { field: "value", label: "Valor", from: "Sim", to: "Não" },
      ]);
    });

    it("número sai como número; texto sai como está", () => {
      expect(configChange("security.idleTimeoutMinutes", "20", "45")).toEqual([
        { field: "value", label: "Valor", from: "20", to: "45" },
      ]);
      expect(configChange("app.name", "true", "Meu Produto")).toEqual([
        { field: "value", label: "Valor", from: "true", to: "Meu Produto" },
      ]);
    });

    it("chave que saiu do catálogo sai com o texto gravado, sem erro", () => {
      expect(configChange("legacy.darkMode", "true", "1.5")).toEqual([
        { field: "value", label: "Valor", from: "true", to: "1.5" },
      ]);
    });

    it("`[omitido]` e texto fora do tipo saem como estão", () => {
      expect(configChange("notifications.email", "[omitido]", "sim")).toEqual([
        { field: "value", label: "Valor", from: "[omitido]", to: "sim" },
      ]);
      expect(configChange("security.idleTimeoutMinutes", "[omitido]", "")).toEqual([
        { field: "value", label: "Valor", from: "[omitido]", to: "[Vazio]" },
      ]);
    });
  });

  it("campo fora do catálogo sai com o nome técnico, depois dos conhecidos; entidade desconhecida também", () => {
    const known = toAuditFieldChanges(
      log({ changedFields: ["legacyCode", "name"], before: { legacyCode: 1.5, name: "A" }, after: { name: "B" } }),
    );
    const unknownEntity = toAuditFieldChanges(
      log({ entity: "Order", changedFields: ["status"], before: { status: "open" }, after: { status: "closed" } }),
    );

    expect(known).toEqual([
      { field: "name", label: "Nome", from: "A", to: "B" },
      { field: "legacyCode", label: "legacyCode", from: "1,5", to: "[Vazio]" },
    ]);
    expect(unknownEntity).toEqual([{ field: "status", label: "status", from: "open", to: "closed" }]);
  });
});

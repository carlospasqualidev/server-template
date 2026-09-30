import { describe, expect, it } from "vitest";

import { AuditAction } from "@/generated/prisma/client";
import { AUDIT_ENTITIES, AUDIT_EXPORT_FORMATS } from "@/modules/audit/audit.catalog";
import {
  AUDIT_DESCRIPTIONS,
  exportAuditDescription,
  genericAuditDescription,
} from "@/modules/audit/audit.descriptions";

describe("AUDIT_DESCRIPTIONS", () => {
  it("nomeia o registro entre aspas, no passado, com ponto final", () => {
    expect(AUDIT_DESCRIPTIONS.User.created("Maria Alves")).toBe('Criou o usuário "Maria Alves".');
    expect(AUDIT_DESCRIPTIONS.User.addedToRole("Maria Alves", "Financeiro")).toBe(
      'Incluiu o usuário "Maria Alves" no cargo "Financeiro".',
    );
    expect(AUDIT_DESCRIPTIONS.Role.copied("Financeiro", "Financeiro (cópia)")).toBe(
      'Copiou o cargo "Financeiro" como "Financeiro (cópia)".',
    );
    expect(AUDIT_DESCRIPTIONS.Role.updated("Financeiro")).toBe('Editou o cargo "Financeiro".');
    expect(AUDIT_DESCRIPTIONS.SystemConfig.updated("Nome da aplicação")).toBe(
      'Alterou a configuração "Nome da aplicação".',
    );
  });

  it("login não repete o nome: o autor é o próprio usuário", () => {
    expect(AUDIT_DESCRIPTIONS.User.loggedIn()).toBe("Entrou no sistema.");
  });
});

describe("genericAuditDescription", () => {
  it("frase sem nome da ação sobre a entidade, a que a anonimização grava", () => {
    expect(genericAuditDescription("User", "create")).toBe("Criou um usuário.");
    expect(genericAuditDescription("User", "update")).toBe("Editou um usuário.");
    expect(genericAuditDescription("User", "statusChange")).toBe("Alterou o status de um usuário.");
    expect(genericAuditDescription("User", "login")).toBe("Entrou no sistema.");
    expect(genericAuditDescription("Role", "delete")).toBe("Excluiu um cargo.");
    expect(genericAuditDescription("Role", "export")).toBe("Exportou a lista de cargos.");
    expect(genericAuditDescription("SystemConfig", "update")).toBe("Editou uma configuração.");
  });

  it("toda entidade do catálogo tem frase para toda ação, sem nome entre aspas", () => {
    for (const entity of AUDIT_ENTITIES) {
      for (const action of Object.values(AuditAction)) {
        const description = genericAuditDescription(entity, action);

        expect(description).toMatch(/^\p{Lu}.*\.$/u);
        expect(description).not.toContain('"');
      }
    }
  });
});

describe("exportAuditDescription", () => {
  it("diz o que saiu e em qual formato, para toda entidade e formato", () => {
    expect(exportAuditDescription("User", "CSV")).toBe("Exportou a lista de usuários em CSV.");
    expect(exportAuditDescription("SystemConfig", "PDF")).toBe("Exportou as configurações do sistema em PDF.");

    for (const entity of AUDIT_ENTITIES) {
      for (const format of AUDIT_EXPORT_FORMATS) {
        const description = exportAuditDescription(entity, format);

        expect(description.startsWith("Exportou ")).toBe(true);
        expect(description.endsWith(` em ${format}.`)).toBe(true);
      }
    }
  });
});

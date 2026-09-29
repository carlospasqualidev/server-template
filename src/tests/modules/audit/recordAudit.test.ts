import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { createCompany, createUser, findAuditLogs } from "@/tests/helpers/factories";

describe("recordAuditService", () => {
  it("grava pelo tx da mutação: a transação que falha não deixa registro", async () => {
    const company = await createCompany();

    await expect(
      prisma.$transaction(async (tx) => {
        await recordAuditService(
          {
            companyId: company.id,
            module: "USERS",
            entity: "User",
            entityId: null,
            action: "create",
            description: "Cadastrou um usuário",
            after: { isActive: true },
          },
          tx,
        );

        throw new Error("falha depois do registro");
      }),
    ).rejects.toThrow("falha depois do registro");

    expect(await findAuditLogs(company.id)).toEqual([]);
  });

  it("fora de uma requisição, sem autor explícito, grava como ação do sistema e sem metadados", async () => {
    const company = await createCompany();

    await prisma.$transaction((tx) =>
      recordAuditService(
        {
          companyId: company.id,
          module: "SETTINGS",
          entity: "SystemConfig",
          entityId: "app.name",
          action: "update",
          description: "Alterou uma configuração",
          before: { value: "A" },
          after: { value: "B" },
        },
        tx,
      ),
    );

    expect(await findAuditLogs(company.id)).toEqual([
      expect.objectContaining({
        userId: null,
        requestId: null,
        ip: null,
        userAgent: null,
        before: { value: "A" },
        after: { value: "B" },
        changedFields: ["value"],
      }),
    ]);
  });

  it("autor explícito, dados pessoais da entidade redigidos depois do diff e segredo só como campo alterado", async () => {
    const user = await createUser();

    await prisma.$transaction((tx) =>
      recordAuditService(
        {
          companyId: user.companyId,
          module: "USERS",
          entity: "User",
          entityId: user.id,
          action: "update",
          description: "Alterou um usuário",
          before: { name: "Ana", email: "ana@example.com", phone: null, isActive: true, password: "hash-antigo" },
          after: { name: "Ana", email: "ana.maria@example.com", phone: null, isActive: true, password: "hash-novo" },
          hiddenChangedFields: ["password"],
          userId: user.id,
        },
        tx,
      ),
    );

    const [log] = await findAuditLogs(user.companyId);

    expect(log).toMatchObject({
      userId: user.id,
      changedFields: ["email", "password"],
      before: { name: "[omitido]", email: "[omitido]", phone: null, isActive: true },
      after: { name: "[omitido]", email: "[omitido]", phone: null, isActive: true },
    });
    expect(JSON.stringify(log)).not.toMatch(/hash-antigo|hash-novo|ana\.maria@example\.com/);
  });

  it("`update` sem campo alterado não é gravado; lista grava todos os demais numa inserção", async () => {
    const company = await createCompany();

    await prisma.$transaction((tx) =>
      recordAuditService(
        [
          {
            companyId: company.id,
            module: "SETTINGS",
            entity: "SystemConfig",
            entityId: "app.name",
            action: "update",
            description: "Alterou uma configuração",
            before: { value: "Igual" },
            after: { value: "Igual" },
          },
          {
            companyId: company.id,
            module: "SETTINGS",
            entity: "SystemConfig",
            entityId: "notifications.email",
            action: "update",
            description: "Alterou uma configuração",
            before: { value: "true" },
            after: { value: "false" },
          },
        ],
        tx,
      ),
    );

    const logs = await findAuditLogs(company.id);

    expect(logs.map((log) => log.entityId)).toEqual(["notifications.email"]);
  });
});

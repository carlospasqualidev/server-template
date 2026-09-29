import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { systemConfigsLockName } from "@/modules/systemConfigs/services/updateSystemConfigs.service";
import { createTestApp } from "@/tests/helpers/app";
import { createCompany, createSystemConfig, createUser, findAuditLogs } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";
import { raceAgainstSystemConfigsBatch } from "@/tests/helpers/systemConfigsLock";

const SYSTEM_CONFIGS_URL = "/api/client/system-configs";

describe("trilha de auditoria: configurações de sistema", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function patchConfigs(userId: string, items: { key: string; value: string }[]) {
    return app.inject({
      method: "PATCH",
      url: SYSTEM_CONFIGS_URL,
      cookies: sessionCookiesFor(userId),
      payload: { items },
    });
  }

  it("um registro por chave alterada, com o antes efetivo (padrão quando não havia valor) e a chave como entityId", async () => {
    const admin = await createUser();
    await createSystemConfig({ companyId: admin.companyId, key: "security.idleTimeoutMinutes", value: "30" });

    const response = await patchConfigs(admin.id, [
      { key: "security.idleTimeoutMinutes", value: "45" },
      { key: "app.name", value: "Painel ACME" },
    ]);

    expect(response.statusCode).toBe(200);
    const logs = await findAuditLogs(admin.companyId);

    expect(logs).toHaveLength(2);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: "SETTINGS",
          entity: "SystemConfig",
          entityId: "app.name",
          action: "update",
          description: "Alterou uma configuração",
          before: { value: "Meu Produto" },
          after: { value: "Painel ACME" },
          changedFields: ["value"],
          userId: admin.id,
        }),
        expect.objectContaining({
          entityId: "security.idleTimeoutMinutes",
          before: { value: "30" },
          after: { value: "45" },
        }),
      ]),
    );
  });

  it("chave enviada sem mudança não gera registro", async () => {
    const admin = await createUser();
    await createSystemConfig({ companyId: admin.companyId, key: "notifications.email", value: "false" });

    await patchConfigs(admin.id, [
      { key: "notifications.email", value: "false" },
      { key: "app.name", value: "Meu Produto" },
      { key: "security.idleTimeoutMinutes", value: "020" },
    ]);

    expect(await findAuditLogs(admin.companyId)).toEqual([]);
  });

  it("chave com `redactInAudit` (e-mail de suporte) registra que mudou, sem o endereço", async () => {
    const admin = await createUser();

    await patchConfigs(admin.id, [{ key: "app.supportEmail", value: "ajuda@acme.example.com" }]);

    const logs = await findAuditLogs(admin.companyId);

    expect(logs).toEqual([
      expect.objectContaining({
        entityId: "app.supportEmail",
        before: { value: "[omitido]" },
        after: { value: "[omitido]" },
        changedFields: ["value"],
      }),
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/ajuda@acme|suporte@example/);
  });

  it("lote inválido responde 400 e não grava registro", async () => {
    const admin = await createUser();

    const response = await patchConfigs(admin.id, [
      { key: "app.name", value: "Novo nome" },
      { key: "security.idleTimeoutMinutes", value: "12.5" },
    ]);

    expect(response.statusCode).toBe(400);
    expect(await findAuditLogs(admin.companyId)).toEqual([]);
  });

  it("dois lotes simultâneos da mesma empresa: o segundo registra como antes o que o primeiro confirmou", async () => {
    const admin = await createUser();

    const response = await raceAgainstSystemConfigsBatch({
      companyId: admin.companyId,
      lockedWrite: (tx) =>
        tx.systemConfig.create({ data: { companyId: admin.companyId, key: "app.name", value: "Do outro lote" } }),
      operation: () => patchConfigs(admin.id, [{ key: "app.name", value: "Deste lote" }]),
    });

    expect(response.statusCode).toBe(200);
    expect(await findAuditLogs(admin.companyId)).toEqual([
      expect.objectContaining({ before: { value: "Do outro lote" }, after: { value: "Deste lote" } }),
    ]);
  });

  it("a trava é por empresa: o lote de outra empresa não espera", async () => {
    const admin = await createUser();
    const otherCompany = await createCompany();
    let onLocked: () => void = () => undefined;
    let release: () => void = () => undefined;
    const locked = new Promise<void>((resolve) => {
      onLocked = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Outra empresa segura a trava dos lotes dela até o fim do teste.
    const holder = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${systemConfigsLockName(otherCompany.id)}))`;
      onLocked();
      await released;
    });

    await Promise.race([locked, holder]);
    const outcome = await Promise.race([
      patchConfigs(admin.id, [{ key: "app.name", value: "Sem espera" }]),
      sleep(2_000).then(() => "esperou a trava de outra empresa" as const),
    ]);
    release();
    await holder;

    expect(outcome).not.toBe("esperou a trava de outra empresa");
  });
});

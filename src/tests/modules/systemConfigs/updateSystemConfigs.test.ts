import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { PERMISSION_DENIED_MESSAGE } from "@/hooks/requirePermission";
import { prisma } from "@/lib/prisma";
import { PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { createSystemConfig, createUser, findAuditLogs } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";
import { raceAgainstSystemConfigsBatch } from "@/tests/helpers/systemConfigsLock";

const SYSTEM_CONFIGS_URL = "/api/client/system-configs";

const IDLE_TIMEOUT_LABEL = "Tempo de inatividade até o logout (min)";

const ANONYMIZE_LABEL = "Prazo para anonimizar a auditoria (meses)";

const DELETE_LABEL = "Prazo para apagar a auditoria (meses)";

const RETENTION_RULE_MESSAGE = `${DELETE_LABEL}: Informe um valor maior que o prazo para anonimizar.`;

function valuesByKey(body: { systemConfigs: { key: string; value: string }[] }): Record<string, string> {
  return Object.fromEntries(body.systemConfigs.map((config) => [config.key, config.value]));
}

async function storedValues(companyId: string): Promise<Record<string, string>> {
  const configs = await prisma.systemConfig.findMany({ where: { companyId }, select: { key: true, value: true } });

  return Object.fromEntries(configs.map((config) => [config.key, config.value]));
}

describe("PATCH /api/client/system-configs", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function patchConfigs(userId: string, items: unknown) {
    return app.inject({
      method: "PATCH",
      url: SYSTEM_CONFIGS_URL,
      cookies: sessionCookiesFor(userId),
      payload: { items },
    });
  }

  it("grava o lote, responde a lista completa com mensagem e o GET reflete", async () => {
    const admin = await createUser();

    const response = await patchConfigs(admin.id, [
      { key: "security.idleTimeoutMinutes", value: "45" },
      { key: "notifications.email", value: "false" },
    ]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "Configurações atualizadas.",
      systemConfigs: expect.arrayContaining([
        expect.objectContaining({ key: "security.idleTimeoutMinutes", valueType: "int", value: "45" }),
      ]),
    });
    expect(valuesByKey(response.json())).toEqual({
      "app.name": "Meu Produto",
      "app.supportEmail": "suporte@example.com",
      "security.idleTimeoutMinutes": "45",
      "audit.anonymizeAfterMonths": "12",
      "audit.deleteAfterMonths": "60",
      "notifications.email": "false",
    });

    const list = await app.inject({ method: "GET", url: SYSTEM_CONFIGS_URL, cookies: sessionCookiesFor(admin.id) });
    expect(valuesByKey(list.json())).toEqual(valuesByKey(response.json()));
    expect(await storedValues(admin.companyId)).toEqual({
      "security.idleTimeoutMinutes": "45",
      "notifications.email": "false",
    });
  });

  it("grava o valor normalizado (inteiro sem zero à esquerda, e-mail em minúsculas, texto sem espaço nas pontas)", async () => {
    const admin = await createUser();

    const response = await patchConfigs(admin.id, [
      { key: "app.name", value: "  Painel ACME  " },
      { key: "app.supportEmail", value: " Ajuda@ACME.example.com " },
      { key: "security.idleTimeoutMinutes", value: "030" },
    ]);

    expect(response.statusCode).toBe(200);
    expect(await storedValues(admin.companyId)).toEqual({
      "app.name": "Painel ACME",
      "app.supportEmail": "ajuda@acme.example.com",
      "security.idleTimeoutMinutes": "30",
    });
  });

  it("regrava a chave já gravada, sem duplicar a linha", async () => {
    const admin = await createUser();
    await createSystemConfig({ companyId: admin.companyId, key: "app.name", value: "Antes" });

    const response = await patchConfigs(admin.id, [{ key: "app.name", value: "Depois" }]);

    expect(response.statusCode).toBe(200);
    expect(await prisma.systemConfig.count({ where: { companyId: admin.companyId } })).toBe(1);
    expect(await storedValues(admin.companyId)).toEqual({ "app.name": "Depois" });
  });

  it("um item inválido no lote não grava nenhum", async () => {
    const admin = await createUser();
    await createSystemConfig({ companyId: admin.companyId, key: "notifications.email", value: "true" });

    const response = await patchConfigs(admin.id, [
      { key: "app.name", value: "Novo nome" },
      { key: "notifications.email", value: "false" },
      { key: "security.idleTimeoutMinutes", value: "12.5" },
    ]);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: `items.2.value: ${IDLE_TIMEOUT_LABEL}: Informe um número inteiro.`,
      issues: [{ path: "items.2.value", message: `${IDLE_TIMEOUT_LABEL}: Informe um número inteiro.` }],
    });
    expect(await storedValues(admin.companyId)).toEqual({ "notifications.email": "true" });
  });

  it.each([
    {
      case: "inteiro abaixo da faixa",
      item: { key: "security.idleTimeoutMinutes", value: "0" },
      message: `${IDLE_TIMEOUT_LABEL}: Informe um valor de 1 a 480 minutos.`,
    },
    {
      case: "inteiro acima da faixa",
      item: { key: "security.idleTimeoutMinutes", value: "481" },
      message: `${IDLE_TIMEOUT_LABEL}: Informe um valor de 1 a 480 minutos.`,
    },
    {
      case: "inteiro com texto",
      item: { key: "security.idleTimeoutMinutes", value: "vinte" },
      message: `${IDLE_TIMEOUT_LABEL}: Informe um número inteiro.`,
    },
    {
      case: "boolean fora de true/false",
      item: { key: "notifications.email", value: "sim" },
      message: "Notificações por e-mail: Use true ou false.",
    },
    {
      case: "e-mail inválido",
      item: { key: "app.supportEmail", value: "suporte-sem-arroba" },
      message: "E-mail de suporte: O e-mail deve possuir o formato email@example.com.",
    },
    { case: "texto vazio", item: { key: "app.name", value: "   " }, message: "Nome da aplicação: Informe o nome." },
    {
      case: "prazo para anonimizar abaixo da faixa",
      item: { key: "audit.anonymizeAfterMonths", value: "0" },
      message: `${ANONYMIZE_LABEL}: Informe um valor de 1 a 120 meses.`,
    },
    {
      case: "prazo para anonimizar acima da faixa",
      item: { key: "audit.anonymizeAfterMonths", value: "121" },
      message: `${ANONYMIZE_LABEL}: Informe um valor de 1 a 120 meses.`,
    },
    {
      case: "prazo para apagar abaixo da faixa",
      item: { key: "audit.deleteAfterMonths", value: "1" },
      message: `${DELETE_LABEL}: Informe um valor de 2 a 240 meses.`,
    },
    {
      case: "prazo para apagar acima da faixa",
      item: { key: "audit.deleteAfterMonths", value: "241" },
      message: `${DELETE_LABEL}: Informe um valor de 2 a 240 meses.`,
    },
  ])("$case responde 400 citando o rótulo, sem repetir o valor", async ({ item, message }) => {
    const admin = await createUser();

    const response = await patchConfigs(admin.id, [item]);

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "items.0.value", message }]);
    // Mensagem exata: o rótulo e a regra, nunca o valor enviado.
    expect(response.json().message).toBe(`items.0.value: ${message}`);
    expect(await storedValues(admin.companyId)).toEqual({});
  });

  describe("prazos de retenção da auditoria (regra entre chaves)", () => {
    it("grava os dois prazos no mesmo lote quando o de apagar é maior", async () => {
      const admin = await createUser();

      const response = await patchConfigs(admin.id, [
        { key: "audit.deleteAfterMonths", value: "36" },
        { key: "audit.anonymizeAfterMonths", value: "24" },
      ]);

      expect(response.statusCode).toBe(200);
      expect(await storedValues(admin.companyId)).toEqual({
        "audit.anonymizeAfterMonths": "24",
        "audit.deleteAfterMonths": "36",
      });
    });

    it.each([
      { case: "iguais", anonymize: "24", remove: "24" },
      { case: "o de apagar menor", anonymize: "24", remove: "12" },
    ])("os dois no lote, $case: 400 no item do prazo de apagar, nada gravado", async ({ anonymize, remove }) => {
      const admin = await createUser();

      const response = await patchConfigs(admin.id, [
        { key: "app.name", value: "Novo nome" },
        { key: "audit.anonymizeAfterMonths", value: anonymize },
        { key: "audit.deleteAfterMonths", value: remove },
      ]);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        message: `items.2.value: ${RETENTION_RULE_MESSAGE}`,
        issues: [{ path: "items.2.value", message: RETENTION_RULE_MESSAGE }],
      });
      expect(await storedValues(admin.companyId)).toEqual({});
    });

    it.each([
      {
        case: "prazo para anonimizar contra o padrão de apagar (60)",
        item: { key: "audit.anonymizeAfterMonths", value: "60" },
        stored: [],
      },
      {
        case: "prazo para apagar contra o padrão de anonimizar (12)",
        item: { key: "audit.deleteAfterMonths", value: "12" },
        stored: [],
      },
      {
        case: "prazo para anonimizar contra o de apagar gravado",
        item: { key: "audit.anonymizeAfterMonths", value: "30" },
        stored: [{ key: "audit.deleteAfterMonths", value: "24" }],
      },
      {
        case: "prazo para apagar contra o de anonimizar gravado",
        item: { key: "audit.deleteAfterMonths", value: "5" },
        stored: [{ key: "audit.anonymizeAfterMonths", value: "6" }],
      },
    ] as const)("só uma chave no lote, $case: 400 sem gravar nada", async ({ item, stored }) => {
      const admin = await createUser();

      for (const config of stored) {
        await createSystemConfig({ companyId: admin.companyId, ...config });
      }

      const response = await patchConfigs(admin.id, [{ key: "app.name", value: "Novo nome" }, item]);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: RETENTION_RULE_MESSAGE });
      expect(await storedValues(admin.companyId)).toEqual(
        Object.fromEntries(stored.map((config) => [config.key, config.value])),
      );
      expect(await findAuditLogs(admin.companyId)).toEqual([]);
    });

    it("só uma chave no lote, válida contra a gravada: grava", async () => {
      const admin = await createUser();
      await createSystemConfig({ companyId: admin.companyId, key: "audit.anonymizeAfterMonths", value: "3" });

      const response = await patchConfigs(admin.id, [{ key: "audit.deleteAfterMonths", value: "6" }]);

      expect(response.statusCode).toBe(200);
      expect(await storedValues(admin.companyId)).toEqual({
        "audit.anonymizeAfterMonths": "3",
        "audit.deleteAfterMonths": "6",
      });
    });

    it("confere contra o gravado depois da trava: o lote simultâneo que confirmou antes conta", async () => {
      const admin = await createUser();

      // Outro lote da empresa grava o prazo de apagar em 24 e ainda não confirmou; este, que só traz o de anonimizar
      // em 30 (válido contra o padrão de 60), espera a trava e lê os 24 já confirmados.
      const response = await raceAgainstSystemConfigsBatch({
        companyId: admin.companyId,
        lockedWrite: (tx) =>
          tx.systemConfig.create({ data: { companyId: admin.companyId, key: "audit.deleteAfterMonths", value: "24" } }),
        operation: () => patchConfigs(admin.id, [{ key: "audit.anonymizeAfterMonths", value: "30" }]),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: RETENTION_RULE_MESSAGE });
      expect(await storedValues(admin.companyId)).toEqual({ "audit.deleteAfterMonths": "24" });
    });
  });

  it("chave desconhecida responde 400", async () => {
    const admin = await createUser();

    const response = await patchConfigs(admin.id, [
      { key: "app.name", value: "Novo nome" },
      { key: "app.inexistente", value: "x" },
    ]);

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "items.1.key", message: "Configuração desconhecida." }]);
    expect(await storedValues(admin.companyId)).toEqual({});
  });

  it("chave repetida no lote responde 400", async () => {
    const admin = await createUser();

    const response = await patchConfigs(admin.id, [
      { key: "app.name", value: "Um" },
      { key: "app.name", value: "Dois" },
    ]);

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([
      { path: "items.1.key", message: "Nome da aplicação: a configuração aparece mais de uma vez." },
    ]);
    expect(await storedValues(admin.companyId)).toEqual({});
  });

  it.each([
    {
      case: "lote vazio",
      payload: { items: [] },
      issue: { path: "items", message: "Informe ao menos uma configuração." },
    },
    { case: "sem items", payload: {}, issue: { path: "items", message: "Informe as configurações a gravar." } },
    {
      case: "valor que não é texto",
      payload: { items: [{ key: "security.idleTimeoutMinutes", value: 30 }] },
      issue: { path: "items.0.value", message: "Informe o valor da configuração como texto." },
    },
  ])("$case responde 400", async ({ payload, issue }) => {
    const admin = await createUser();

    const response = await app.inject({
      method: "PATCH",
      url: SYSTEM_CONFIGS_URL,
      cookies: sessionCookiesFor(admin.id),
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([issue]);
  });

  it("grava só na empresa do autenticado", async () => {
    const admin = await createUser();
    const otherAdmin = await createUser();
    await createSystemConfig({ companyId: otherAdmin.companyId, key: "app.name", value: "Outra Empresa" });

    const response = await patchConfigs(admin.id, [{ key: "app.name", value: "Minha Empresa" }]);

    expect(response.statusCode).toBe(200);
    expect(await storedValues(admin.companyId)).toEqual({ "app.name": "Minha Empresa" });
    expect(await storedValues(otherAdmin.companyId)).toEqual({ "app.name": "Outra Empresa" });
  });

  it("sem sessão responde 401", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: SYSTEM_CONFIGS_URL,
      payload: { items: [{ key: "app.name", value: "X" }] },
    });

    expect(response.statusCode).toBe(401);
  });

  it("sem backoffice.systemConfigs.update responde 403 e não grava", async () => {
    const user = await createUser({
      permissions: PERMISSION_NAMES.filter((name) => name !== "backoffice.systemConfigs.update"),
    });

    const response = await patchConfigs(user.id, [{ key: "app.name", value: "Sem permissão" }]);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: PERMISSION_DENIED_MESSAGE });
    expect(await storedValues(user.companyId)).toEqual({});
  });

  it("só com backoffice.systemConfigs.update responde 200", async () => {
    const user = await createUser({ permissions: ["backoffice.systemConfigs.update"] });

    const response = await patchConfigs(user.id, [{ key: "app.name", value: "Com permissão" }]);

    expect(response.statusCode).toBe(200);
    expect(await storedValues(user.companyId)).toEqual({ "app.name": "Com permissão" });
  });
});

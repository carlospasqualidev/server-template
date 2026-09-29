import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { PERMISSION_DENIED_MESSAGE } from "@/hooks/requirePermission";
import { PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { createSystemConfig, createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const SYSTEM_CONFIGS_URL = "/api/client/system-configs";

const DEFAULT_SYSTEM_CONFIGS = [
  {
    key: "app.name",
    module: "GENERAL",
    label: "Nome da aplicação",
    description: "Nome exibido na interface e nas comunicações enviadas aos usuários.",
    valueType: "string",
    value: "Meu Produto",
  },
  {
    key: "app.supportEmail",
    module: "GENERAL",
    label: "E-mail de suporte",
    description: "Endereço que os usuários veem para pedir ajuda.",
    valueType: "string",
    value: "suporte@example.com",
  },
  {
    key: "security.idleTimeoutMinutes",
    module: "SECURITY",
    label: "Tempo de inatividade até o logout (min)",
    description:
      "Minutos sem atividade até a sessão ser encerrada no navegador. Vale para os usuários sem um tempo próprio no cadastro.",
    valueType: "int",
    value: "20",
  },
  {
    key: "notifications.email",
    module: "NOTIFICATIONS",
    label: "Notificações por e-mail",
    description: "Envia por e-mail os avisos do sistema.",
    valueType: "boolean",
    value: "true",
  },
];

function valuesByKey(body: { systemConfigs: { key: string; value: string }[] }): Record<string, string> {
  return Object.fromEntries(body.systemConfigs.map((config) => [config.key, config.value]));
}

describe("GET /api/client/system-configs", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sem valor gravado devolve o catálogo inteiro com os padrões, na ordem da tela, sem count", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "GET",
      url: SYSTEM_CONFIGS_URL,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ systemConfigs: DEFAULT_SYSTEM_CONFIGS });
  });

  it("devolve o valor gravado pela empresa no lugar do padrão", async () => {
    const admin = await createUser();
    await createSystemConfig({ companyId: admin.companyId, key: "security.idleTimeoutMinutes", value: "45" });
    await createSystemConfig({ companyId: admin.companyId, key: "notifications.email", value: "false" });

    const response = await app.inject({
      method: "GET",
      url: SYSTEM_CONFIGS_URL,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(200);
    expect(valuesByKey(response.json())).toEqual({
      "app.name": "Meu Produto",
      "app.supportEmail": "suporte@example.com",
      "security.idleTimeoutMinutes": "45",
      "notifications.email": "false",
    });
  });

  it("não mostra os valores de outra empresa", async () => {
    const admin = await createUser();
    const otherAdmin = await createUser();
    await createSystemConfig({ companyId: otherAdmin.companyId, key: "app.name", value: "Outra Empresa" });

    const response = await app.inject({
      method: "GET",
      url: SYSTEM_CONFIGS_URL,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(valuesByKey(response.json())["app.name"]).toBe("Meu Produto");
  });

  it("valor gravado que não passa mais pela regra da chave aparece como o padrão", async () => {
    const admin = await createUser();
    await createSystemConfig({ companyId: admin.companyId, key: "security.idleTimeoutMinutes", value: "9999" });

    const response = await app.inject({
      method: "GET",
      url: SYSTEM_CONFIGS_URL,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(valuesByKey(response.json())["security.idleTimeoutMinutes"]).toBe("20");
  });

  it("sem sessão responde 401", async () => {
    const response = await app.inject({ method: "GET", url: SYSTEM_CONFIGS_URL });

    expect(response.statusCode).toBe(401);
  });

  it("sem backoffice.systemConfigs.read responde 403", async () => {
    const user = await createUser({
      permissions: PERMISSION_NAMES.filter((name) => name !== "backoffice.systemConfigs.read"),
    });

    const response = await app.inject({
      method: "GET",
      url: SYSTEM_CONFIGS_URL,
      cookies: sessionCookiesFor(user.id),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: PERMISSION_DENIED_MESSAGE });
  });

  it("só com backoffice.systemConfigs.read responde 200", async () => {
    const user = await createUser({ permissions: ["backoffice.systemConfigs.read"] });

    const response = await app.inject({
      method: "GET",
      url: SYSTEM_CONFIGS_URL,
      cookies: sessionCookiesFor(user.id),
    });

    expect(response.statusCode).toBe(200);
  });
});

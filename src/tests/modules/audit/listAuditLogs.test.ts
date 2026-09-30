import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { PERMISSION_DENIED_MESSAGE } from "@/hooks/requirePermission";
import { PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { createAuditLog, createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const AUDIT_LOGS_URL = "/api/client/audit-logs";

function at(isoDate: string): Date {
  return new Date(isoDate);
}

describe("GET /api/client/audit-logs", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function listLogs(userId: string, query = "") {
    return app.inject({ method: "GET", url: `${AUDIT_LOGS_URL}${query}`, cookies: sessionCookiesFor(userId) });
  }

  function ids(response: { json: () => { logs: { id: string }[] } }): string[] {
    return response.json().logs.map((log) => log.id);
  }

  it("lista a trilha da empresa, mais recente primeiro, com o nome do autor e o total", async () => {
    const admin = await createUser({ name: "Ana Admin" });
    const older = await createAuditLog({
      companyId: admin.companyId,
      module: "SECURITY",
      entity: "Role",
      entityId: "role-1",
      action: "create",
      description: "Criou um cargo",
      userId: admin.id,
      createdAt: at("2026-09-01T10:00:00.000Z"),
    });
    const newer = await createAuditLog({
      companyId: admin.companyId,
      entityId: admin.id,
      changedFields: ["name"],
      description: "Alterou um usuário",
      createdAt: at("2026-09-02T10:00:00.000Z"),
    });

    const response = await listLogs(admin.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      logs: [
        {
          id: newer.id,
          module: "USERS",
          entity: "User",
          entityId: admin.id,
          action: "update",
          description: "Alterou um usuário",
          changedFields: ["name"],
          userId: null,
          userName: null,
          createdAt: "2026-09-02T10:00:00.000Z",
        },
        {
          id: older.id,
          module: "SECURITY",
          entity: "Role",
          entityId: "role-1",
          action: "create",
          description: "Criou um cargo",
          changedFields: [],
          userId: admin.id,
          userName: "Ana Admin",
          createdAt: "2026-09-01T10:00:00.000Z",
        },
      ],
      count: 2,
    });
  });

  it("não lista registros de outra empresa", async () => {
    const admin = await createUser();
    const outsider = await createUser();
    const own = await createAuditLog({ companyId: admin.companyId });
    await createAuditLog({ companyId: outsider.companyId, userId: outsider.id });

    const response = await listLogs(admin.id);

    expect(ids(response)).toEqual([own.id]);
    expect(response.json().count).toBe(1);
  });

  it("autor excluído depois continua com o nome na lista", async () => {
    const admin = await createUser();
    const former = await createUser({ companyId: admin.companyId, name: "Bruno Antigo", deletedAt: new Date() });
    await createAuditLog({ companyId: admin.companyId, userId: former.id });

    const response = await listLogs(admin.id);

    expect(response.json().logs).toEqual([expect.objectContaining({ userId: former.id, userName: "Bruno Antigo" })]);
  });

  it("paginação 0-based com `count` do total", async () => {
    const admin = await createUser();
    const logs = [];

    for (const day of ["01", "02", "03"]) {
      logs.push(await createAuditLog({ companyId: admin.companyId, createdAt: at(`2026-09-${day}T10:00:00.000Z`) }));
    }

    const firstPage = await listLogs(admin.id, "?page=0&pageSize=2");
    const secondPage = await listLogs(admin.id, "?page=1&pageSize=2");

    expect(ids(firstPage)).toEqual([logs[2]?.id, logs[1]?.id]);
    expect(ids(secondPage)).toEqual([logs[0]?.id]);
    expect(secondPage.json().count).toBe(3);
  });

  describe("filtros", () => {
    it("módulo, entidade e ação aceitam vários valores separados por vírgula", async () => {
      const admin = await createUser();
      const usersUpdate = await createAuditLog({ companyId: admin.companyId, module: "USERS", entity: "User" });
      const roleCreate = await createAuditLog({
        companyId: admin.companyId,
        module: "SECURITY",
        entity: "Role",
        action: "create",
      });
      const settings = await createAuditLog({
        companyId: admin.companyId,
        module: "SETTINGS",
        entity: "SystemConfig",
        entityId: "app.name",
      });

      const byModule = await listLogs(admin.id, "?module=USERS,SETTINGS&orderBy=entity&order=asc");
      const byEntity = await listLogs(admin.id, "?entity=Role");
      const byAction = await listLogs(admin.id, "?action=create,delete");

      expect(ids(byModule)).toEqual([settings.id, usersUpdate.id]);
      expect(ids(byEntity)).toEqual([roleCreate.id]);
      expect(ids(byAction)).toEqual([roleCreate.id]);
    });

    it("autor (vários, por vírgula)", async () => {
      const admin = await createUser();
      const other = await createUser({ companyId: admin.companyId });
      const third = await createUser({ companyId: admin.companyId });
      const byAdmin = await createAuditLog({
        companyId: admin.companyId,
        userId: admin.id,
        createdAt: at("2026-09-01T10:00:00.000Z"),
      });
      const byOther = await createAuditLog({
        companyId: admin.companyId,
        userId: other.id,
        createdAt: at("2026-09-02T10:00:00.000Z"),
      });
      await createAuditLog({ companyId: admin.companyId, userId: third.id });
      await createAuditLog({ companyId: admin.companyId });

      const byAuthors = await listLogs(admin.id, `?userId=${admin.id},${other.id}&orderBy=createdAt&order=asc`);

      expect(ids(byAuthors)).toEqual([byAdmin.id, byOther.id]);
    });

    it("id do registro por igualdade exata, sem casar prefixo", async () => {
      const admin = await createUser();
      const sameEntry = { companyId: admin.companyId, userId: admin.id, module: "USERS", entity: "User" } as const;
      const exact = await createAuditLog({ ...sameEntry, entityId: "alvo-1" });
      await createAuditLog({ ...sameEntry, entityId: "alvo-2" });
      await createAuditLog({ ...sameEntry, entityId: "alvo-10" });

      const byEntityId = await listLogs(admin.id, "?entityId=alvo-1");

      expect(ids(byEntityId)).toEqual([exact.id]);
      expect(byEntityId.json().count).toBe(1);
    });

    it("período inclusivo nas duas pontas", async () => {
      const admin = await createUser();
      const before = await createAuditLog({ companyId: admin.companyId, createdAt: at("2026-09-01T02:59:59.999Z") });
      const onStart = await createAuditLog({ companyId: admin.companyId, createdAt: at("2026-09-01T03:00:00.000Z") });
      const onEnd = await createAuditLog({ companyId: admin.companyId, createdAt: at("2026-09-02T02:59:59.999Z") });
      const after = await createAuditLog({ companyId: admin.companyId, createdAt: at("2026-09-02T03:00:00.000Z") });

      const range = await listLogs(
        admin.id,
        "?createdFrom=2026-09-01T03:00:00.000Z&createdTo=2026-09-02T02:59:59.999Z&order=asc",
      );
      const fromOnly = await listLogs(admin.id, "?createdFrom=2026-09-02T02:59:59.999Z&order=asc");
      const toOnly = await listLogs(admin.id, "?createdTo=2026-09-01T03:00:00.000Z&order=asc");

      expect(ids(range)).toEqual([onStart.id, onEnd.id]);
      expect(ids(fromOnly)).toEqual([onEnd.id, after.id]);
      expect(ids(toOnly)).toEqual([before.id, onStart.id]);
    });

    it("busca na descrição, na entidade, no id do registro e no nome do autor, sem diferenciar maiúsculas", async () => {
      const admin = await createUser({ name: "Admin" });
      const author = await createUser({ companyId: admin.companyId, name: "Carla Souza" });
      const formerAuthor = await createUser({
        companyId: admin.companyId,
        name: "Otávio Desligado",
        deletedAt: new Date(),
      });
      const byDescription = await createAuditLog({ companyId: admin.companyId, description: "Bloqueou um usuário" });
      const byEntity = await createAuditLog({ companyId: admin.companyId, entity: "SystemConfig" });
      const byEntityId = await createAuditLog({ companyId: admin.companyId, entityId: "security.idleTimeoutMinutes" });
      const byAuthor = await createAuditLog({ companyId: admin.companyId, userId: author.id });
      const byFormerAuthor = await createAuditLog({ companyId: admin.companyId, userId: formerAuthor.id });
      await createAuditLog({
        companyId: admin.companyId,
        description: "Criou um cargo",
        entityId: "outro",
        userId: admin.id,
      });

      const search = async (text: string) => ids(await listLogs(admin.id, `?search=${encodeURIComponent(text)}`));

      expect(await search("BLOQUEOU")).toEqual([byDescription.id]);
      expect(await search("systemconfig")).toEqual([byEntity.id]);
      expect(await search("CONFIGURAÇÃO DO SISTEMA")).toEqual([byEntity.id]);
      expect(await search("idleTimeout")).toEqual([byEntityId.id]);
      expect(await search("carla")).toEqual([byAuthor.id]);
      expect(await search("otávio")).toEqual([byFormerAuthor.id]);
    });

    it("o rótulo da entidade amplia a busca: `usuário` traz os eventos de `User`, mesmo sem a palavra no texto", async () => {
      const admin = await createUser();
      const userEvent = await createAuditLog({
        companyId: admin.companyId,
        entity: "User",
        description: "Entrou no sistema.",
        createdAt: at("2026-09-01T10:00:00.000Z"),
      });
      const roleEvent = await createAuditLog({
        companyId: admin.companyId,
        module: "SECURITY",
        entity: "Role",
        description: 'Editou o cargo "Suporte".',
        createdAt: at("2026-09-02T10:00:00.000Z"),
      });
      const configEvent = await createAuditLog({
        companyId: admin.companyId,
        module: "SETTINGS",
        entity: "SystemConfig",
        description: 'Alterou a configuração "Nome da aplicação".',
        createdAt: at("2026-09-03T10:00:00.000Z"),
      });

      const search = async (text: string) => listLogs(admin.id, `?search=${encodeURIComponent(text)}`);

      expect(ids(await search("usuário"))).toEqual([userEvent.id]);
      expect(ids(await search("CARGO"))).toEqual([roleEvent.id]);
      expect(ids(await search("config"))).toEqual([configEvent.id]);
      expect((await search("usuário")).json().count).toBe(1);
    });

    it("só os valores de antes e depois são buscados: o nome de uma chave (ou um valor nulo) não casa", async () => {
      const admin = await createUser();
      const byValue = await createAuditLog({
        companyId: admin.companyId,
        after: { name: "Equipe de Email Marketing", image: null },
      });
      await createAuditLog({
        companyId: admin.companyId,
        before: { name: "Ana", email: "ana@example.com", image: null },
        after: { name: "Ana Paula", email: "ana@example.com", image: null },
        changedFields: ["name"],
      });

      const search = async (text: string) => listLogs(admin.id, `?search=${encodeURIComponent(text)}`);
      const byKey = await search("email");

      expect(ids(byKey)).toEqual([byValue.id]);
      expect(byKey.json().count).toBe(1);
      expect(ids(await search("image"))).toEqual([]);
      expect(ids(await search("null"))).toEqual([]);
    });

    it("termo curto, sem trigrama (menos de três letras seguidas), dá o mesmo resultado", async () => {
      const admin = await createUser();
      const byValue = await createAuditLog({
        companyId: admin.companyId,
        after: { name: "Joana" },
        createdAt: at("2026-09-01T10:00:00.000Z"),
      });
      const byDescription = await createAuditLog({
        companyId: admin.companyId,
        description: "Ajustou a jornada",
        createdAt: at("2026-09-02T10:00:00.000Z"),
      });
      await createAuditLog({ companyId: admin.companyId, description: "Criou um cargo", after: { name: "Maria" } });
      await createAuditLog({ companyId: admin.companyId, after: { jobTitle: "Analista" } });

      const shortTerm = await listLogs(admin.id, "?search=JO");

      expect(ids(shortTerm)).toEqual([byDescription.id, byValue.id]);
      expect(shortTerm.json().count).toBe(2);
    });

    it("busca nos valores gravados em antes e depois, sem diferenciar maiúsculas, só na própria empresa", async () => {
      const admin = await createUser({ name: "Admin" });
      const outsider = await createUser();
      const renamed = await createAuditLog({
        companyId: admin.companyId,
        before: { name: "Joana Prado", email: "joana@example.com" },
        after: { name: "Joana Prado Lima", email: "joana@example.com" },
        changedFields: ["name"],
      });
      const created = await createAuditLog({
        companyId: admin.companyId,
        action: "create",
        after: { name: "Paulo", phone: "48988887777" },
      });
      const deleted = await createAuditLog({
        companyId: admin.companyId,
        action: "delete",
        before: { name: "Ex Funcionário", phone: null },
      });
      await createAuditLog({ companyId: admin.companyId, after: { name: "Outra Pessoa" } });
      await createAuditLog({ companyId: outsider.companyId, after: { name: "Joana Prado", phone: "48988887777" } });

      const search = async (text: string) => ids(await listLogs(admin.id, `?search=${encodeURIComponent(text)}`));

      expect(await search("JOANA PRADO")).toEqual([renamed.id]);
      expect(await search("prado lima")).toEqual([renamed.id]);
      expect(await search("88887777")).toEqual([created.id]);
      expect(await search("ex funcionário")).toEqual([deleted.id]);
      expect((await listLogs(admin.id, "?search=joana")).json().count).toBe(1);
    });

    it("o termo é texto literal: `%`, `_` e `\\` não funcionam como curinga", async () => {
      const admin = await createUser();
      const percent = await createAuditLog({ companyId: admin.companyId, description: "Desconto de 50% aplicado" });
      await createAuditLog({ companyId: admin.companyId, description: "Desconto de 500 aplicado" });
      const underscore = await createAuditLog({ companyId: admin.companyId, entityId: "app_name" });
      await createAuditLog({ companyId: admin.companyId, entityId: "appXname" });
      const backslash = await createAuditLog({ companyId: admin.companyId, description: "Caminho C:\\temp" });
      await createAuditLog({ companyId: admin.companyId, description: "Caminho C:temp" });

      const search = async (text: string) => ids(await listLogs(admin.id, `?search=${encodeURIComponent(text)}`));

      expect(await search("50%")).toEqual([percent.id]);
      expect(await search("p_n")).toEqual([underscore.id]);
      expect(await search("C:\\t")).toEqual([backslash.id]);
    });

    it('`\\` e `"` casam nos valores do JSON, que o texto do jsonb guarda escapados', async () => {
      const admin = await createUser();
      const quoted = await createAuditLog({ companyId: admin.companyId, after: { name: 'Cliente "VIP" Ltda' } });
      await createAuditLog({ companyId: admin.companyId, after: { name: "Cliente VIP Ltda" } });
      const backslash = await createAuditLog({ companyId: admin.companyId, before: { image: "C:\\fotos\\ana.png" } });
      await createAuditLog({ companyId: admin.companyId, before: { image: "C:fotos/ana.png" } });
      const both = await createAuditLog({ companyId: admin.companyId, after: { name: 'Pasta "D:\\dados"' } });

      const search = async (text: string) => ids(await listLogs(admin.id, `?search=${encodeURIComponent(text)}`));

      expect(await search('"VIP"')).toEqual([quoted.id]);
      expect(await search("C:\\fotos\\ana")).toEqual([backslash.id]);
      expect(await search('"d:\\DADOS"')).toEqual([both.id]);
    });

    it("valor numérico, booleano e data dentro do JSON casam pelo texto gravado", async () => {
      const admin = await createUser();
      const numeric = await createAuditLog({ companyId: admin.companyId, after: { idleTimeoutMinutes: 45 } });
      await createAuditLog({ companyId: admin.companyId, after: { idleTimeoutMinutes: 30 } });
      const boolean = await createAuditLog({ companyId: admin.companyId, before: { isActive: false } });
      await createAuditLog({ companyId: admin.companyId, before: { isActive: true } });
      const date = await createAuditLog({
        companyId: admin.companyId,
        after: { lastLoginAt: "2026-03-15T10:20:00.000Z" },
      });
      await createAuditLog({ companyId: admin.companyId, after: { lastLoginAt: "2026-04-01T08:00:00.000Z" } });

      const search = async (text: string) => ids(await listLogs(admin.id, `?search=${encodeURIComponent(text)}`));

      expect(await search("45")).toEqual([numeric.id]);
      expect(await search("false")).toEqual([boolean.id]);
      expect(await search("2026-03-15")).toEqual([date.id]);
      expect(await search("2026-03-15T10:20")).toEqual([date.id]);
    });

    it("busca combinada com filtro: os dois valem juntos", async () => {
      const admin = await createUser();
      const match = await createAuditLog({
        companyId: admin.companyId,
        module: "SECURITY",
        after: { roles: "Financeiro" },
      });
      await createAuditLog({ companyId: admin.companyId, module: "USERS", after: { name: "Financeiro da Silva" } });

      const response = await listLogs(admin.id, "?search=financeiro&module=SECURITY");

      expect(ids(response)).toEqual([match.id]);
      expect(response.json().count).toBe(1);
    });
  });

  describe("ordenação", () => {
    it("por campo da allowlist, nos dois sentidos", async () => {
      const admin = await createUser();
      const alpha = await createAuditLog({ companyId: admin.companyId, description: "Alterou um cargo" });
      const beta = await createAuditLog({ companyId: admin.companyId, description: "Bloqueou um usuário" });
      const gamma = await createAuditLog({ companyId: admin.companyId, description: "Cadastrou um usuário" });

      const ascending = await listLogs(admin.id, "?orderBy=description&order=asc");
      const descending = await listLogs(admin.id, "?orderBy=description&order=desc");

      expect(ids(ascending)).toEqual([alpha.id, beta.id, gamma.id]);
      expect(ids(descending)).toEqual([gamma.id, beta.id, alpha.id]);
    });

    it("campo fora da allowlist responde 400", async () => {
      const admin = await createUser();

      const response = await listLogs(admin.id, "?orderBy=userName");

      expect(response.statusCode).toBe(400);
      expect(response.json().issues).toEqual([expect.objectContaining({ path: "orderBy" })]);
    });
  });

  describe("validação", () => {
    it.each([
      ["?module=USERS,BILLING", "module.1", "Módulo de auditoria inválido."],
      ["?action=send", "action.0", "Ação de auditoria inválida."],
      ["?userId=nao-e-uuid", "userId.0", "Identificador inválido."],
      ["?createdFrom=2026-09-01", "createdFrom", "Data e hora inválidas. Use ISO 8601 em UTC."],
      ["?page=-1", "page", expect.any(String)],
    ])("%s responde 400 com o campo", async (query, path, message) => {
      const admin = await createUser();

      const response = await listLogs(admin.id, query);

      expect(response.statusCode).toBe(400);
      expect(response.json().issues).toEqual([{ path, message }]);
    });
  });

  describe("acesso", () => {
    it("sem sessão responde 401", async () => {
      const response = await app.inject({ method: "GET", url: AUDIT_LOGS_URL });

      expect(response.statusCode).toBe(401);
    });

    it("sem `backoffice.audit.read` responde 403", async () => {
      const user = await createUser({
        permissions: PERMISSION_NAMES.filter((name) => name !== "backoffice.audit.read"),
      });

      const response = await listLogs(user.id);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: PERMISSION_DENIED_MESSAGE });
    });

    it("só com `backoffice.audit.read` lista", async () => {
      const user = await createUser({ permissions: ["backoffice.audit.read"] });

      const response = await listLogs(user.id);

      expect(response.statusCode).toBe(200);
    });
  });
});

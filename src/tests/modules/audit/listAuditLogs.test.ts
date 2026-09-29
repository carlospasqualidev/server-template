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
      const byDescription = await createAuditLog({ companyId: admin.companyId, description: "Bloqueou um usuário" });
      const byEntity = await createAuditLog({ companyId: admin.companyId, entity: "SystemConfig" });
      const byEntityId = await createAuditLog({ companyId: admin.companyId, entityId: "security.idleTimeoutMinutes" });
      const byAuthor = await createAuditLog({ companyId: admin.companyId, userId: author.id });
      await createAuditLog({
        companyId: admin.companyId,
        description: "Criou um cargo",
        entityId: "outro",
        userId: admin.id,
      });

      const search = async (text: string) => ids(await listLogs(admin.id, `?search=${encodeURIComponent(text)}`));

      expect(await search("BLOQUEOU")).toEqual([byDescription.id]);
      expect(await search("systemconfig")).toEqual([byEntity.id]);
      expect(await search("idleTimeout")).toEqual([byEntityId.id]);
      expect(await search("carla")).toEqual([byAuthor.id]);
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
      ["?action=export", "action.0", "Ação de auditoria inválida."],
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

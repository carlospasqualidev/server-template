import { type LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { PERMISSION_DENIED_MESSAGE } from "@/hooks/requirePermission";
import { PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { createAuditLog, createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const AUDIT_LOGS_URL = "/api/client/audit-logs";
const USERS_URL = "/api/client/users";

describe("GET /api/client/audit-logs/entities/:entity/:entityId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function listTimeline(userId: string, path: string) {
    return app.inject({ method: "GET", url: `${AUDIT_LOGS_URL}/entities/${path}`, cookies: sessionCookiesFor(userId) });
  }

  function ids(response: LightMyRequestResponse): string[] {
    return response.json().logs.map((log: { id: string }) => log.id);
  }

  it("a vida de um usuário, mais recente primeiro: exclusão, bloqueio, edição e criação, com autor e de→para", async () => {
    const admin = await createUser({ name: "Ana Admin" });
    const cookies = sessionCookiesFor(admin.id);

    const created = await app.inject({
      method: "POST",
      url: USERS_URL,
      cookies,
      payload: {
        name: "Marina",
        email: "marina@example.com",
        password: "senha-forte-1",
        confirmPassword: "senha-forte-1",
        idleTimeoutMinutes: 30,
      },
    });
    const userId = created.json().user.id;

    await app.inject({
      method: "PATCH",
      url: `${USERS_URL}/${userId}`,
      cookies,
      payload: { name: "Marina Alves", isActive: false, password: "outra-senha-1", confirmPassword: "outra-senha-1" },
    });
    await app.inject({ method: "DELETE", url: `${USERS_URL}/${userId}`, cookies });

    const response = await listTimeline(admin.id, `User/${userId}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      logs: [
        {
          id: expect.any(String),
          module: "USERS",
          entity: "User",
          entityId: userId,
          action: "delete",
          description: 'Excluiu o usuário "Marina Alves".',
          changedFields: [],
          userId: admin.id,
          userName: "Ana Admin",
          createdAt: expect.any(String),
          fieldChanges: [
            { field: "name", label: "Nome", from: "Marina Alves", to: "[Vazio]" },
            { field: "email", label: "E-mail", from: "marina@example.com", to: "[Vazio]" },
            { field: "isActive", label: "Ativo", from: "Não", to: "[Vazio]" },
            { field: "idleTimeoutMinutes", label: "Tempo de inatividade (minutos)", from: "30", to: "[Vazio]" },
          ],
        },
        expect.objectContaining({
          module: "SECURITY",
          action: "statusChange",
          description: 'Bloqueou o usuário "Marina Alves".',
          fieldChanges: [{ field: "isActive", label: "Ativo", from: "Sim", to: "Não" }],
        }),
        expect.objectContaining({
          module: "USERS",
          action: "update",
          description: 'Editou o usuário "Marina Alves".',
          fieldChanges: [
            { field: "name", label: "Nome", from: "Marina", to: "Marina Alves" },
            { field: "password", label: "Senha", from: "[omitido]", to: "[omitido]" },
          ],
        }),
        expect.objectContaining({
          action: "create",
          description: 'Criou o usuário "Marina".',
          fieldChanges: [
            { field: "name", label: "Nome", from: "[Vazio]", to: "Marina" },
            { field: "email", label: "E-mail", from: "[Vazio]", to: "marina@example.com" },
            { field: "isActive", label: "Ativo", from: "[Vazio]", to: "Sim" },
            { field: "idleTimeoutMinutes", label: "Tempo de inatividade (minutos)", from: "[Vazio]", to: "30" },
          ],
        }),
      ],
      count: 4,
    });
    // O de→para substitui o antes e o depois crus, que ficam no detalhe.
    expect(response.json().logs[0]).not.toHaveProperty("before");
    expect(response.json().logs[0]).not.toHaveProperty("after");
  });

  it("deixa de fora os eventos de outro registro, de outra entidade com o mesmo id e de outra empresa", async () => {
    const admin = await createUser();
    const outsider = await createUser();
    const target = "01900000-0000-7000-8000-00000000000a";
    const mine = await createAuditLog({ companyId: admin.companyId, entity: "User", entityId: target });
    await createAuditLog({
      companyId: admin.companyId,
      entity: "User",
      entityId: "01900000-0000-7000-8000-00000000000b",
    });
    await createAuditLog({ companyId: admin.companyId, entity: "Role", entityId: target });
    await createAuditLog({ companyId: outsider.companyId, entity: "User", entityId: target });

    const response = await listTimeline(admin.id, `User/${target}`);

    expect(ids(response)).toEqual([mine.id]);
    expect(response.json().count).toBe(1);
  });

  it("registro sem eventos (ou de outra empresa) devolve a lista vazia, não 404", async () => {
    const admin = await createUser();
    const outsider = await createUser();
    await createAuditLog({ companyId: outsider.companyId, entity: "User", entityId: outsider.id });

    const response = await listTimeline(admin.id, `User/${outsider.id}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ logs: [], count: 0 });
  });

  it("configuração pela chave, com o ponto no id", async () => {
    const admin = await createUser();
    const log = await createAuditLog({
      companyId: admin.companyId,
      module: "SETTINGS",
      entity: "SystemConfig",
      entityId: "security.idleTimeoutMinutes",
      changedFields: ["value"],
      before: { value: "20" },
      after: { value: "45" },
    });
    await createAuditLog({ companyId: admin.companyId, entity: "SystemConfig", entityId: "app.name" });

    const response = await listTimeline(admin.id, "SystemConfig/security.idleTimeoutMinutes");

    expect(ids(response)).toEqual([log.id]);
    expect(response.json().logs[0].fieldChanges).toEqual([{ field: "value", label: "Valor", from: "20", to: "45" }]);
  });

  it("mais recente primeiro, com desempate por id na mesma data, e paginação 0-based com `count` do total", async () => {
    const admin = await createUser();
    const entityId = "01900000-0000-7000-8000-00000000000c";
    const sameMoment = new Date("2026-09-29T12:00:00.000Z");
    const oldest = await createAuditLog({
      companyId: admin.companyId,
      entityId,
      createdAt: new Date("2026-09-28T12:00:00.000Z"),
    });
    const tiedFirst = await createAuditLog({ companyId: admin.companyId, entityId, createdAt: sameMoment });
    const tiedSecond = await createAuditLog({ companyId: admin.companyId, entityId, createdAt: sameMoment });

    const all = await listTimeline(admin.id, `User/${entityId}`);
    const secondPage = await listTimeline(admin.id, `User/${entityId}?page=1&pageSize=2`);

    expect(ids(all)).toEqual([tiedSecond.id, tiedFirst.id, oldest.id]);
    expect(ids(secondPage)).toEqual([oldest.id]);
    expect(secondPage.json().count).toBe(3);
  });

  it("autor excluído continua com o nome; ação do sistema vem sem autor", async () => {
    const admin = await createUser();
    const author = await createUser({ companyId: admin.companyId, name: "Autora Antiga" });
    const entityId = "01900000-0000-7000-8000-00000000000d";
    await createAuditLog({ companyId: admin.companyId, entityId, userId: author.id });
    await app.inject({ method: "DELETE", url: `${USERS_URL}/${author.id}`, cookies: sessionCookiesFor(admin.id) });
    await createAuditLog({ companyId: admin.companyId, entityId });

    const response = await listTimeline(admin.id, `User/${entityId}`);

    expect(response.json().logs.map((log: { userName: string | null }) => log.userName)).toEqual([
      null,
      "Autora Antiga",
    ]);
  });

  describe("validação", () => {
    it("entidade fora do catálogo responde 400", async () => {
      const admin = await createUser();

      const response = await listTimeline(admin.id, "Order/01900000-0000-7000-8000-000000000000");

      expect(response.statusCode).toBe(400);
      expect(response.json().issues).toEqual([{ path: "entity", message: "Entidade de auditoria inválida." }]);
    });

    it("id vazio e paginação inválida respondem 400", async () => {
      const admin = await createUser();

      const emptyId = await listTimeline(admin.id, "User/%20");
      const badPage = await listTimeline(admin.id, "User/abc?page=-1");
      const bigPage = await listTimeline(admin.id, "User/abc?pageSize=101");

      expect(emptyId.statusCode).toBe(400);
      expect(emptyId.json().issues).toEqual([{ path: "entityId", message: "Informe o identificador do registro." }]);
      expect(badPage.statusCode).toBe(400);
      expect(badPage.json().issues).toEqual([expect.objectContaining({ path: "page" })]);
      expect(bigPage.statusCode).toBe(400);
      expect(bigPage.json().issues).toEqual([expect.objectContaining({ path: "pageSize" })]);
    });
  });

  describe("acesso", () => {
    it("sem sessão responde 401", async () => {
      const response = await app.inject({ method: "GET", url: `${AUDIT_LOGS_URL}/entities/User/abc` });

      expect(response.statusCode).toBe(401);
    });

    it("sem `backoffice.audit.read` responde 403; só com ela, lista", async () => {
      const admin = await createUser();
      const withoutRead = await createUser({
        companyId: admin.companyId,
        permissions: PERMISSION_NAMES.filter((name) => name !== "backoffice.audit.read"),
      });
      const onlyRead = await createUser({ companyId: admin.companyId, permissions: ["backoffice.audit.read"] });
      const log = await createAuditLog({ companyId: admin.companyId, entityId: admin.id });

      const denied = await listTimeline(withoutRead.id, `User/${admin.id}`);
      const allowed = await listTimeline(onlyRead.id, `User/${admin.id}`);

      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toEqual({ message: PERMISSION_DENIED_MESSAGE });
      expect(allowed.statusCode).toBe(200);
      expect(ids(allowed)).toEqual([log.id]);
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { PERMISSION_DENIED_MESSAGE } from "@/hooks/requirePermission";
import { PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { createAuditLog, createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const AUDIT_LOGS_URL = "/api/client/audit-logs";
const NOT_FOUND_MESSAGE = "Registro de auditoria não encontrado.";

describe("GET /api/client/audit-logs/:auditLogId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function findLog(userId: string, auditLogId: string) {
    return app.inject({ method: "GET", url: `${AUDIT_LOGS_URL}/${auditLogId}`, cookies: sessionCookiesFor(userId) });
  }

  it("traz antes, depois e o autor, sem `userName` nem metadados da requisição", async () => {
    const admin = await createUser({ name: "Ana Admin", email: "ana@example.com" });
    const log = await createAuditLog({
      companyId: admin.companyId,
      module: "SETTINGS",
      entity: "SystemConfig",
      entityId: "security.idleTimeoutMinutes",
      action: "update",
      description: "Alterou uma configuração",
      changedFields: ["value"],
      before: { value: "30" },
      after: { value: "45" },
      userId: admin.id,
      createdAt: new Date("2026-09-29T12:00:00.000Z"),
    });

    const response = await findLog(admin.id, log.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      auditLog: {
        id: log.id,
        module: "SETTINGS",
        entity: "SystemConfig",
        entityId: "security.idleTimeoutMinutes",
        action: "update",
        description: "Alterou uma configuração",
        changedFields: ["value"],
        userId: admin.id,
        createdAt: "2026-09-29T12:00:00.000Z",
        before: { value: "30" },
        after: { value: "45" },
        user: { id: admin.id, name: "Ana Admin", email: "ana@example.com" },
        fieldChanges: [{ field: "value", label: "Valor", from: "30", to: "45" }],
      },
    });
  });

  describe("de→para legível (`fieldChanges`)", () => {
    it("edição: os campos alterados na ordem do catálogo, com rótulo e valor formatado; antes e depois crus mantidos", async () => {
      const admin = await createUser();
      const before = { name: "Maria", email: "maria@example.com", image: null, phone: null, idleTimeoutMinutes: 30 };
      const after = { ...before, name: "Maria Alves", phone: "48999999999", idleTimeoutMinutes: 90 };
      const log = await createAuditLog({
        companyId: admin.companyId,
        action: "update",
        changedFields: ["idleTimeoutMinutes", "phone", "name", "password"],
        before,
        after,
      });

      const { auditLog } = (await findLog(admin.id, log.id)).json();

      expect(auditLog.before).toEqual(before);
      expect(auditLog.after).toEqual(after);
      expect(auditLog.fieldChanges).toEqual([
        { field: "name", label: "Nome", from: "Maria", to: "Maria Alves" },
        { field: "phone", label: "Telefone", from: "[Vazio]", to: "48999999999" },
        { field: "password", label: "Senha", from: "[omitido]", to: "[omitido]" },
        { field: "idleTimeoutMinutes", label: "Tempo de inatividade (minutos)", from: "30", to: "90" },
      ]);
    });

    it("mudança de status; criação e exclusão só com os campos que têm valor", async () => {
      const admin = await createUser();
      const statusChange = await createAuditLog({
        companyId: admin.companyId,
        module: "SECURITY",
        action: "statusChange",
        changedFields: ["isActive"],
        before: { isActive: true },
        after: { isActive: false },
      });
      const created = await createAuditLog({
        companyId: admin.companyId,
        entity: "Role",
        action: "create",
        after: { name: "Suporte", description: null, permissions: "backoffice.users.read" },
      });
      const deleted = await createAuditLog({
        companyId: admin.companyId,
        entity: "Role",
        action: "delete",
        before: { name: "Suporte", description: "Atendimento", permissions: null },
      });

      const fieldChangesOf = async (id: string) => (await findLog(admin.id, id)).json().auditLog.fieldChanges;

      expect(await fieldChangesOf(statusChange.id)).toEqual([
        { field: "isActive", label: "Ativo", from: "Sim", to: "Não" },
      ]);
      expect(await fieldChangesOf(created.id)).toEqual([
        { field: "name", label: "Nome", from: "[Vazio]", to: "Suporte" },
        { field: "permissions", label: "Permissões", from: "[Vazio]", to: "backoffice.users.read" },
      ]);
      expect(await fieldChangesOf(deleted.id)).toEqual([
        { field: "name", label: "Nome", from: "Suporte", to: "[Vazio]" },
        { field: "description", label: "Descrição", from: "Atendimento", to: "[Vazio]" },
      ]);
    });

    it("configuração sai pelo tipo da chave; chave que saiu do catálogo, com o texto gravado", async () => {
      const admin = await createUser();
      const configLog = (entityId: string) =>
        createAuditLog({
          companyId: admin.companyId,
          module: "SETTINGS",
          entity: "SystemConfig",
          entityId,
          action: "update",
          changedFields: ["value"],
          before: { value: "true" },
          after: { value: "false" },
        });
      const known = await configLog("notifications.email");
      const removed = await configLog("legacy.darkMode");

      expect((await findLog(admin.id, known.id)).json().auditLog.fieldChanges).toEqual([
        { field: "value", label: "Valor", from: "Sim", to: "Não" },
      ]);

      const response = await findLog(admin.id, removed.id);

      expect(response.statusCode).toBe(200);
      expect(response.json().auditLog.fieldChanges).toEqual([
        { field: "value", label: "Valor", from: "true", to: "false" },
      ]);
    });

    it("login e exportação vêm com a lista vazia", async () => {
      const admin = await createUser();
      const login = await createAuditLog({ companyId: admin.companyId, module: "SECURITY", action: "login" });
      const exported = await createAuditLog({
        companyId: admin.companyId,
        action: "export",
        after: { busca: "ana", formato: "CSV" },
      });

      expect((await findLog(admin.id, login.id)).json().auditLog.fieldChanges).toEqual([]);
      expect((await findLog(admin.id, exported.id)).json().auditLog.fieldChanges).toEqual([]);
    });
  });

  it("ação do sistema vem com `user` null; criação com `before` null", async () => {
    const admin = await createUser();
    const log = await createAuditLog({ companyId: admin.companyId, action: "create", after: { isActive: true } });

    const response = await findLog(admin.id, log.id);

    expect(response.json().auditLog).toMatchObject({
      userId: null,
      user: null,
      before: null,
      after: { isActive: true },
    });
  });

  it("registro de outra empresa responde 404, como inexistente", async () => {
    const admin = await createUser();
    const outsider = await createUser();
    const foreign = await createAuditLog({ companyId: outsider.companyId, userId: outsider.id });

    const fromOtherCompany = await findLog(admin.id, foreign.id);
    const missing = await findLog(admin.id, "01900000-0000-7000-8000-000000000000");

    expect(fromOtherCompany.statusCode).toBe(404);
    expect(fromOtherCompany.json()).toEqual({ message: NOT_FOUND_MESSAGE });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ message: NOT_FOUND_MESSAGE });
  });

  it("id inválido responde 400", async () => {
    const admin = await createUser();

    const response = await findLog(admin.id, "nao-e-uuid");

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "auditLogId", message: "Identificador inválido." }]);
  });

  it("sem sessão responde 401 e sem `backoffice.audit.read` responde 403", async () => {
    const admin = await createUser();
    const log = await createAuditLog({ companyId: admin.companyId });
    const user = await createUser({
      companyId: admin.companyId,
      permissions: PERMISSION_NAMES.filter((name) => name !== "backoffice.audit.read"),
    });

    const withoutSession = await app.inject({ method: "GET", url: `${AUDIT_LOGS_URL}/${log.id}` });
    const withoutPermission = await findLog(user.id, log.id);

    expect(withoutSession.statusCode).toBe(401);
    expect(withoutPermission.statusCode).toBe(403);
    expect(withoutPermission.json()).toEqual({ message: PERMISSION_DENIED_MESSAGE });
  });
});

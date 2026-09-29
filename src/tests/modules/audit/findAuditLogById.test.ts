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
      },
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

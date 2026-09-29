import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createUser, DEFAULT_PASSWORD, findAuditLogs } from "@/tests/helpers/factories";

const SESSION_URL = "/api/client/session";

describe("trilha de auditoria: sessão", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimitMax: 100 });
  });

  afterAll(async () => {
    await app.close();
  });

  it("login bem-sucedido registra `login` em SECURITY, com o próprio usuário como autor", async () => {
    const user = await createUser({ email: "ana@example.com" });

    const response = await app.inject({
      method: "POST",
      url: `${SESSION_URL}/login`,
      headers: { "user-agent": "vitest-agent" },
      payload: { email: "ana@example.com", password: DEFAULT_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(await findAuditLogs(user.companyId)).toEqual([
      expect.objectContaining({
        module: "SECURITY",
        entity: "User",
        entityId: user.id,
        action: "login",
        description: "Entrou no sistema",
        before: null,
        after: null,
        changedFields: [],
        userId: user.id,
        requestId: expect.any(String),
        ip: "127.0.0.1",
        userAgent: "vitest-agent",
      }),
    ]);
  });

  it("login que falha (senha errada, conta bloqueada) não grava registro", async () => {
    const user = await createUser({ email: "ana@example.com" });
    const blocked = await createUser({ companyId: user.companyId, email: "bloqueada@example.com", isActive: false });

    const wrongPassword = await app.inject({
      method: "POST",
      url: `${SESSION_URL}/login`,
      payload: { email: "ana@example.com", password: "senha-errada" },
    });
    const blockedAccount = await app.inject({
      method: "POST",
      url: `${SESSION_URL}/login`,
      payload: { email: blocked.email, password: DEFAULT_PASSWORD },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(blockedAccount.statusCode).toBe(403);
    expect(await findAuditLogs(user.companyId)).toEqual([]);
  });

  it("register registra a criação do usuário na empresa nova, com ele mesmo como autor", async () => {
    const response = await app.inject({
      method: "POST",
      url: `${SESSION_URL}/register`,
      payload: { name: "Marina Alves", email: "marina@example.com", password: "senha-forte-1" },
    });

    expect(response.statusCode).toBe(201);
    const { id: userId } = response.json().user;
    const { companyId } = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const logs = await findAuditLogs(companyId);

    expect(logs).toEqual([
      expect.objectContaining({
        module: "USERS",
        entity: "User",
        entityId: userId,
        action: "create",
        description: "Criou a própria conta",
        before: null,
        after: { name: "[omitido]", email: "[omitido]", image: null, idleTimeoutMinutes: null },
        userId,
      }),
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/senha-forte-1|marina@example\.com|Marina Alves/);
  });

  it("register com e-mail repetido responde 409 e não grava registro", async () => {
    await createUser({ email: "repetido@example.com" });

    const response = await app.inject({
      method: "POST",
      url: `${SESSION_URL}/register`,
      payload: { name: "Outra", email: "repetido@example.com", password: "senha-forte-1" },
    });

    expect(response.statusCode).toBe(409);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

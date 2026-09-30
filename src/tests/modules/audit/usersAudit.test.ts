import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { AUDIT_USER_AGENT_MAX_LENGTH } from "@/config/constants";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createRole, createUser, DEFAULT_PASSWORD, findAdminRole, findAuditLogs } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";

describe("trilha de auditoria: usuários", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /users", () => {
    it("registra a criação com autor, metadados da requisição, os dados pessoais e o nome na descrição", async () => {
      const admin = await createUser();

      const response = await app.inject({
        method: "POST",
        url: USERS_URL,
        cookies: sessionCookiesFor(admin.id),
        headers: { "user-agent": "vitest-agent" },
        payload: {
          name: "Marina Alves",
          email: "marina@example.com",
          password: "senha-forte-1",
          confirmPassword: "senha-forte-1",
          phone: "48999999999",
          idleTimeoutMinutes: 30,
        },
      });

      expect(response.statusCode).toBe(201);
      const created = response.json().user;
      const logs = await findAuditLogs(admin.companyId);

      expect(logs).toEqual([
        expect.objectContaining({
          companyId: admin.companyId,
          module: "USERS",
          entity: "User",
          entityId: created.id,
          action: "create",
          description: 'Criou o usuário "Marina Alves".',
          before: null,
          after: {
            name: "Marina Alves",
            email: "marina@example.com",
            image: null,
            phone: "48999999999",
            isActive: true,
            idleTimeoutMinutes: 30,
          },
          changedFields: [],
          userId: admin.id,
          requestId: expect.any(String),
          ip: "127.0.0.1",
          userAgent: "vitest-agent",
        }),
      ]);
    });

    it("senha e hash nunca aparecem no registro; o e-mail fica no depois, nunca na descrição", async () => {
      const admin = await createUser();

      await app.inject({
        method: "POST",
        url: USERS_URL,
        cookies: sessionCookiesFor(admin.id),
        payload: {
          name: "Ana",
          email: "ana@example.com",
          password: "senha-secreta-9",
          confirmPassword: "senha-secreta-9",
        },
      });

      const stored = await prisma.user.findUniqueOrThrow({ where: { email: "ana@example.com" } });
      const logs = await findAuditLogs(admin.companyId);
      const serialized = JSON.stringify(logs);

      expect(serialized).not.toContain("senha-secreta-9");
      expect(serialized).not.toContain(stored.password);
      expect(serialized).not.toContain("password");
      expect(logs).toEqual([expect.objectContaining({ after: expect.objectContaining({ email: "ana@example.com" }) })]);
      expect(logs.at(0)?.description).not.toContain("ana@example.com");
    });

    it("user-agent longo é cortado no limite", async () => {
      const admin = await createUser();

      await app.inject({
        method: "POST",
        url: USERS_URL,
        cookies: sessionCookiesFor(admin.id),
        headers: { "user-agent": "a".repeat(AUDIT_USER_AGENT_MAX_LENGTH + 100) },
        payload: { name: "Ana", email: "ana@example.com", password: "senha-forte-1", confirmPassword: "senha-forte-1" },
      });

      const [log] = await findAuditLogs(admin.companyId);

      expect(log?.userAgent).toHaveLength(AUDIT_USER_AGENT_MAX_LENGTH);
    });

    it("e-mail repetido responde 409 e não grava registro", async () => {
      const admin = await createUser({ email: "repetido@example.com" });

      const response = await app.inject({
        method: "POST",
        url: USERS_URL,
        cookies: sessionCookiesFor(admin.id),
        payload: {
          name: "Ana",
          email: "repetido@example.com",
          password: "senha-forte-1",
          confirmPassword: "senha-forte-1",
        },
      });

      expect(response.statusCode).toBe(409);
      expect(await findAuditLogs(admin.companyId)).toEqual([]);
    });
  });

  describe("PATCH /users/:userId", () => {
    it("edição registra antes e depois com os valores (nome antigo e novo) e o nome atual na descrição", async () => {
      const admin = await createUser();
      const target = await createUser({
        companyId: admin.companyId,
        name: "Nome Antigo",
        email: "alvo@example.com",
        idleTimeoutMinutes: 30,
      });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${target.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { name: "Outro Nome", idleTimeoutMinutes: 90 },
      });

      expect(response.statusCode).toBe(200);
      expect(await findAuditLogs(admin.companyId)).toEqual([
        expect.objectContaining({
          module: "USERS",
          entity: "User",
          entityId: target.id,
          action: "update",
          description: 'Editou o usuário "Outro Nome".',
          before: {
            name: "Nome Antigo",
            email: "alvo@example.com",
            image: null,
            phone: null,
            idleTimeoutMinutes: 30,
          },
          after: { name: "Outro Nome", email: "alvo@example.com", image: null, phone: null, idleTimeoutMinutes: 90 },
          changedFields: ["name", "idleTimeoutMinutes"],
          userId: admin.id,
        }),
      ]);
    });

    it("último acesso e cargos ficam fora do antes e do depois", async () => {
      const admin = await createUser();
      const role = await createRole({ companyId: admin.companyId, name: "Suporte" });
      const target = await createUser({
        companyId: admin.companyId,
        name: "Rui",
        email: "rui@example.com",
        roleIds: [role.id],
        lastLoginAt: new Date("2026-09-20T10:00:00.000Z"),
      });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${target.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { idleTimeoutMinutes: 45 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toMatchObject({
        lastLoginAt: "2026-09-20T10:00:00.000Z",
        roles: [{ id: role.id, name: "Suporte" }],
      });
      expect(await findAuditLogs(admin.companyId)).toEqual([
        expect.objectContaining({
          action: "update",
          before: { name: "Rui", email: "rui@example.com", image: null, phone: null, idleTimeoutMinutes: null },
          after: { name: "Rui", email: "rui@example.com", image: null, phone: null, idleTimeoutMinutes: 45 },
          changedFields: ["idleTimeoutMinutes"],
        }),
      ]);
    });

    it("troca de senha aparece só como campo alterado, sem valor", async () => {
      const admin = await createUser();
      const target = await createUser({ companyId: admin.companyId, name: "Lia" });

      await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${target.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { password: "nova-senha-1", confirmPassword: "nova-senha-1" },
      });

      const logs = await findAuditLogs(admin.companyId);
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

      expect(logs).toEqual([
        expect.objectContaining({
          action: "update",
          description: 'Editou o usuário "Lia".',
          changedFields: ["password"],
        }),
      ]);
      expect(JSON.stringify(logs)).not.toContain("nova-senha-1");
      expect(JSON.stringify(logs)).not.toContain(updated.password);
      expect(JSON.stringify(logs)).not.toContain(target.password);
    });

    it("bloquear registra `statusChange` em SECURITY, com o nome na descrição", async () => {
      const admin = await createUser();
      const target = await createUser({ companyId: admin.companyId, name: "Caio" });

      await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${target.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { isActive: false },
      });

      expect(await findAuditLogs(admin.companyId)).toEqual([
        expect.objectContaining({
          module: "SECURITY",
          entity: "User",
          entityId: target.id,
          action: "statusChange",
          description: 'Bloqueou o usuário "Caio".',
          before: { isActive: true },
          after: { isActive: false },
          changedFields: ["isActive"],
          userId: admin.id,
        }),
      ]);
    });

    it("desbloquear registra `statusChange` com a descrição própria", async () => {
      const admin = await createUser();
      const target = await createUser({ companyId: admin.companyId, name: "Caio", isActive: false });

      await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${target.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { isActive: true },
      });

      expect(await findAuditLogs(admin.companyId)).toEqual([
        expect.objectContaining({
          action: "statusChange",
          description: 'Desbloqueou o usuário "Caio".',
          before: { isActive: false },
          after: { isActive: true },
        }),
      ]);
    });

    it("editar e bloquear juntos gera um registro de cada", async () => {
      const admin = await createUser();
      const target = await createUser({ companyId: admin.companyId });

      await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${target.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { phone: "48999999999", isActive: false },
      });

      const logs = await findAuditLogs(admin.companyId);

      expect(logs.map((log) => [log.action, log.changedFields]).toSorted()).toEqual([
        ["statusChange", ["isActive"]],
        ["update", ["phone"]],
      ]);
    });

    it("salvar sem mudar nada não grava registro", async () => {
      const admin = await createUser();
      const target = await createUser({ companyId: admin.companyId, idleTimeoutMinutes: 30 });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${target.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { idleTimeoutMinutes: 30, isActive: true },
      });

      expect(response.statusCode).toBe(200);
      expect(await findAuditLogs(admin.companyId)).toEqual([]);
    });

    it("bloquear o último administrador responde 400 e não grava registro", async () => {
      const admin = await createUser();
      const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.update"] });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${admin.id}`,
        cookies: sessionCookiesFor(manager.id),
        payload: { isActive: false },
      });

      expect(response.statusCode).toBe(400);
      expect(await findAuditLogs(admin.companyId)).toEqual([]);
    });
  });

  describe("PATCH /users/me", () => {
    it("edição do próprio perfil registra antes e depois com os valores, o nome atual e o próprio usuário como autor", async () => {
      const user = await createUser({ name: "Nome Antigo", email: "eu@example.com", permissions: [] });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/me`,
        cookies: sessionCookiesFor(user.id),
        payload: {
          name: "Nome Novo",
          phone: "48999999999",
          image: "https://cdn.example.com/eu.png",
          idleTimeoutMinutes: 15,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(await findAuditLogs(user.companyId)).toEqual([
        expect.objectContaining({
          module: "USERS",
          entity: "User",
          entityId: user.id,
          action: "update",
          description: 'Editou o usuário "Nome Novo".',
          before: { name: "Nome Antigo", email: "eu@example.com", image: null, phone: null, idleTimeoutMinutes: null },
          after: {
            name: "Nome Novo",
            email: "eu@example.com",
            image: "https://cdn.example.com/eu.png",
            phone: "48999999999",
            idleTimeoutMinutes: 15,
          },
          changedFields: ["name", "image", "phone", "idleTimeoutMinutes"],
          userId: user.id,
        }),
      ]);
    });

    it("salvar sem mudar nada não grava registro", async () => {
      const user = await createUser({ name: "Igual" });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/me`,
        cookies: sessionCookiesFor(user.id),
        payload: { name: "Igual" },
      });

      expect(response.statusCode).toBe(200);
      expect(await findAuditLogs(user.companyId)).toEqual([]);
    });

    it("campo fora do perfil responde 400 e não grava registro", async () => {
      const user = await createUser();

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/me`,
        cookies: sessionCookiesFor(user.id),
        payload: { name: "Outro", isActive: false },
      });

      expect(response.statusCode).toBe(400);
      expect(await findAuditLogs(user.companyId)).toEqual([]);
    });
  });

  describe("PUT /users/me/password", () => {
    it("troca da própria senha registra `password` só como campo alterado, sem valor nem hash", async () => {
      const user = await createUser({ name: "Lia", email: "lia@example.com", permissions: [] });

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/me/password`,
        cookies: sessionCookiesFor(user.id),
        payload: { currentPassword: DEFAULT_PASSWORD, password: "nova-senha-1", confirmPassword: "nova-senha-1" },
      });

      expect(response.statusCode).toBe(200);
      const logs = await findAuditLogs(user.companyId);
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const unchanged = { name: "Lia", email: "lia@example.com", image: null, phone: null, idleTimeoutMinutes: null };

      expect(logs).toEqual([
        expect.objectContaining({
          module: "USERS",
          entity: "User",
          entityId: user.id,
          action: "update",
          description: 'Editou o usuário "Lia".',
          before: unchanged,
          after: unchanged,
          changedFields: ["password"],
          userId: user.id,
        }),
      ]);
      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain("nova-senha-1");
      expect(serialized).not.toContain(DEFAULT_PASSWORD);
      expect(serialized).not.toContain(updated.password);
      expect(serialized).not.toContain(user.password);
    });

    it("senha atual errada responde 400 e não grava registro", async () => {
      const user = await createUser();

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/me/password`,
        cookies: sessionCookiesFor(user.id),
        payload: { currentPassword: "senha-errada-1", password: "nova-senha-1", confirmPassword: "nova-senha-1" },
      });

      expect(response.statusCode).toBe(400);
      expect(await findAuditLogs(user.companyId)).toEqual([]);
    });
  });

  describe("DELETE /users/:userId", () => {
    it("registra a exclusão com o estado anterior e o nome na descrição", async () => {
      const admin = await createUser();
      const target = await createUser({
        companyId: admin.companyId,
        name: "Davi Rocha",
        email: "davi@example.com",
        image: "https://cdn.example.com/davi.png",
        isActive: false,
      });

      await app.inject({ method: "DELETE", url: `${USERS_URL}/${target.id}`, cookies: sessionCookiesFor(admin.id) });

      const logs = await findAuditLogs(admin.companyId);

      expect(JSON.stringify(logs)).not.toContain(target.password);
      expect(logs).toEqual([
        expect.objectContaining({
          module: "USERS",
          entity: "User",
          entityId: target.id,
          action: "delete",
          description: 'Excluiu o usuário "Davi Rocha".',
          before: {
            name: "Davi Rocha",
            email: "davi@example.com",
            image: "https://cdn.example.com/davi.png",
            phone: null,
            isActive: false,
            idleTimeoutMinutes: null,
          },
          after: null,
          changedFields: [],
          userId: admin.id,
        }),
      ]);
    });

    it("excluir o último administrador responde 400 e não grava registro", async () => {
      const admin = await createUser();
      const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.delete"] });

      const response = await app.inject({
        method: "DELETE",
        url: `${USERS_URL}/${admin.id}`,
        cookies: sessionCookiesFor(manager.id),
      });

      expect(response.statusCode).toBe(400);
      expect(await findAuditLogs(admin.companyId)).toEqual([]);
    });
  });

  describe("PUT /users/:userId/roles", () => {
    it("registra os cargos antes e depois, pelos nomes, em SECURITY", async () => {
      const admin = await createUser();
      const support = await createRole({
        companyId: admin.companyId,
        name: "Suporte",
        permissions: ["backoffice.users.read"],
      });
      const finance = await createRole({
        companyId: admin.companyId,
        name: "Financeiro",
        permissions: ["backoffice.users.read"],
      });
      const target = await createUser({ companyId: admin.companyId, name: "Eva", roleIds: [support.id] });

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/${target.id}/roles`,
        cookies: sessionCookiesFor(admin.id),
        payload: { roleIds: [finance.id, support.id, (await findAdminRole(admin.companyId)).id] },
      });

      expect(response.statusCode).toBe(200);
      expect(await findAuditLogs(admin.companyId)).toEqual([
        expect.objectContaining({
          module: "SECURITY",
          entity: "User",
          entityId: target.id,
          action: "update",
          description: 'Alterou os cargos do usuário "Eva".',
          before: { roles: "Suporte" },
          after: { roles: "Administrador, Financeiro, Suporte" },
          changedFields: ["roles"],
          userId: admin.id,
        }),
      ]);
    });

    it("mesmo conjunto não grava registro", async () => {
      const admin = await createUser();
      const support = await createRole({ companyId: admin.companyId, permissions: ["backoffice.users.read"] });
      const target = await createUser({ companyId: admin.companyId, roleIds: [support.id] });

      await app.inject({
        method: "PUT",
        url: `${USERS_URL}/${target.id}/roles`,
        cookies: sessionCookiesFor(admin.id),
        payload: { roleIds: [support.id] },
      });

      expect(await findAuditLogs(admin.companyId)).toEqual([]);
    });

    it("atribuir cargo com permissão que o autor não possui responde 403 e não grava registro", async () => {
      const actor = await createUser({ permissions: ["backoffice.users.update", "backoffice.users.read"] });
      const auditors = await createRole({ companyId: actor.companyId, permissions: ["backoffice.audit.read"] });
      const target = await createUser({ companyId: actor.companyId, permissions: [] });

      const response = await app.inject({
        method: "PUT",
        url: `${USERS_URL}/${target.id}/roles`,
        cookies: sessionCookiesFor(actor.id),
        payload: { roleIds: [auditors.id] },
      });

      expect(response.statusCode).toBe(403);
      expect(await findAuditLogs(actor.companyId)).toEqual([]);
    });
  });
});

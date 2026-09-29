import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { raceAgainstAdminChange } from "@/tests/helpers/companyAdminsLock";
import { createUser, findAdminRole } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";

describe("PATCH /api/client/users/:userId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("atualiza só os campos enviados", async () => {
    const admin = await createUser();
    const target = await createUser({ companyId: admin.companyId, name: "Antes", phone: "48999999999" });

    const response = await app.inject({
      method: "PATCH",
      url: `${USERS_URL}/${target.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Depois", isActive: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "Usuário atualizado.",
      user: expect.objectContaining({ id: target.id, name: "Depois", phone: "48999999999", isActive: false }),
    });
  });

  it("troca a senha quando password e confirmPassword batem", async () => {
    const admin = await createUser();
    const target = await createUser({ companyId: admin.companyId });

    const response = await app.inject({
      method: "PATCH",
      url: `${USERS_URL}/${target.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { password: "nova-senha-1", confirmPassword: "nova-senha-1" },
    });

    expect(response.statusCode).toBe(200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword("nova-senha-1", updated.password)).toBe(true);
  });

  it("null limpa telefone e imagem", async () => {
    const admin = await createUser();
    const target = await createUser({
      companyId: admin.companyId,
      phone: "48999999999",
      image: "https://cdn.example.com/a.png",
    });

    const response = await app.inject({
      method: "PATCH",
      url: `${USERS_URL}/${target.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { phone: null, image: null },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ phone: null, image: null });
  });

  describe("último administrador ativo da empresa", () => {
    const LAST_ADMIN_MESSAGE = "Não é possível bloquear o último administrador ativo da empresa.";

    it("não é bloqueado por quem tem users.update e responde 400", async () => {
      const admin = await createUser();
      const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.update"] });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${admin.id}`,
        cookies: sessionCookiesFor(manager.id),
        payload: { isActive: false },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: LAST_ADMIN_MESSAGE });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).isActive).toBe(true);
    });

    it("não bloqueia a si mesmo", async () => {
      const admin = await createUser();

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${admin.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { isActive: false },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: LAST_ADMIN_MESSAGE });
    });

    it("administrador bloqueado e administrador de outra empresa não contam", async () => {
      const admin = await createUser();
      await createUser({ companyId: admin.companyId, isActive: false });
      await createUser();
      const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.update"] });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${admin.id}`,
        cookies: sessionCookiesFor(manager.id),
        payload: { isActive: false },
      });

      expect(response.statusCode).toBe(400);
    });

    it("administrador excluído logicamente não conta", async () => {
      const admin = await createUser();
      await createUser({ companyId: admin.companyId, deletedAt: new Date() });
      const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.update"] });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${admin.id}`,
        cookies: sessionCookiesFor(manager.id),
        payload: { isActive: false },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: LAST_ADMIN_MESSAGE });
    });

    it("com o cargo Administrador excluído, quem o tinha não conta como administrador", async () => {
      const admin = await createUser();
      await prisma.role.update({
        where: { id: (await findAdminRole(admin.companyId)).id },
        data: { deletedAt: new Date() },
      });
      const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.update"] });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${admin.id}`,
        cookies: sessionCookiesFor(manager.id),
        payload: { isActive: false },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user.isActive).toBe(false);
    });

    it("espera quem bloqueia o outro administrador ao mesmo tempo e responde 400", async () => {
      const admin = await createUser();
      const otherAdmin = await createUser({ companyId: admin.companyId });
      const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.update"] });

      const response = await raceAgainstAdminChange({
        companyId: admin.companyId,
        lockedWrite: (tx) => tx.user.update({ where: { id: otherAdmin.id }, data: { isActive: false } }),
        operation: () =>
          app.inject({
            method: "PATCH",
            url: `${USERS_URL}/${admin.id}`,
            cookies: sessionCookiesFor(manager.id),
            payload: { isActive: false },
          }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: LAST_ADMIN_MESSAGE });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).isActive).toBe(true);
    });

    it("é bloqueado quando há outro administrador ativo na empresa", async () => {
      const admin = await createUser();
      const otherAdmin = await createUser({ companyId: admin.companyId });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${otherAdmin.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { isActive: false },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user.isActive).toBe(false);
    });

    it("segue editável nos outros campos", async () => {
      const admin = await createUser();

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${admin.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { name: "Novo nome", isActive: true },
      });

      expect(response.statusCode).toBe(200);
    });

    it("não impede bloquear quem não é administrador", async () => {
      const admin = await createUser();
      const member = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.read"] });

      const response = await app.inject({
        method: "PATCH",
        url: `${USERS_URL}/${member.id}`,
        cookies: sessionCookiesFor(admin.id),
        payload: { isActive: false },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  it("usuário de outra empresa responde 404", async () => {
    const admin = await createUser();
    const outsider = await createUser();

    const response = await app.inject({
      method: "PATCH",
      url: `${USERS_URL}/${outsider.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Hack" },
    });

    expect(response.statusCode).toBe(404);
  });
});

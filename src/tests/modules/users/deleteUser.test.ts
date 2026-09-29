import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { raceAgainstAdminChange } from "@/tests/helpers/companyAdminsLock";
import { createUser, findAdminRole } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";

describe("DELETE /api/client/users/:userId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exclui logicamente: marca deletedAt, bloqueia e some da listagem", async () => {
    const admin = await createUser();
    const target = await createUser({ companyId: admin.companyId });
    const cookies = sessionCookiesFor(admin.id);

    const response = await app.inject({ method: "DELETE", url: `${USERS_URL}/${target.id}`, cookies });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: "Usuário excluído." });

    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(deleted.isActive).toBe(false);

    const afterDelete = await app.inject({ method: "GET", url: `${USERS_URL}/${target.id}`, cookies });
    expect(afterDelete.statusCode).toBe(404);
  });

  it("não permite excluir o próprio usuário", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "DELETE",
      url: `${USERS_URL}/${admin.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Você não pode excluir o próprio usuário." });
  });

  it("não exclui o último administrador ativo da empresa e responde 400", async () => {
    const admin = await createUser();
    const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.delete"] });

    const response = await app.inject({
      method: "DELETE",
      url: `${USERS_URL}/${admin.id}`,
      cookies: sessionCookiesFor(manager.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Não é possível excluir o último administrador ativo da empresa." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).deletedAt).toBeNull();
  });

  it("administrador bloqueado não conta para a regra e pode ser excluído", async () => {
    const admin = await createUser();
    const blockedAdmin = await createUser({ companyId: admin.companyId, isActive: false });

    const response = await app.inject({
      method: "DELETE",
      url: `${USERS_URL}/${blockedAdmin.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(200);
  });

  it("administrador excluído logicamente não conta para a regra", async () => {
    const admin = await createUser();
    await createUser({ companyId: admin.companyId, deletedAt: new Date() });
    const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.delete"] });

    const response = await app.inject({
      method: "DELETE",
      url: `${USERS_URL}/${admin.id}`,
      cookies: sessionCookiesFor(manager.id),
    });

    expect(response.statusCode).toBe(400);
  });

  it("com o cargo Administrador excluído, quem o tinha pode ser excluído", async () => {
    const admin = await createUser();
    await prisma.role.update({
      where: { id: (await findAdminRole(admin.companyId)).id },
      data: { deletedAt: new Date() },
    });
    const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.delete"] });

    const response = await app.inject({
      method: "DELETE",
      url: `${USERS_URL}/${admin.id}`,
      cookies: sessionCookiesFor(manager.id),
    });

    expect(response.statusCode).toBe(200);
  });

  it("espera quem exclui o outro administrador ao mesmo tempo e responde 400", async () => {
    const admin = await createUser();
    const otherAdmin = await createUser({ companyId: admin.companyId });
    const manager = await createUser({ companyId: admin.companyId, permissions: ["backoffice.users.delete"] });

    const response = await raceAgainstAdminChange({
      companyId: admin.companyId,
      lockedWrite: (tx) =>
        tx.user.update({ where: { id: otherAdmin.id }, data: { deletedAt: new Date(), isActive: false } }),
      operation: () =>
        app.inject({ method: "DELETE", url: `${USERS_URL}/${admin.id}`, cookies: sessionCookiesFor(manager.id) }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Não é possível excluir o último administrador ativo da empresa." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).deletedAt).toBeNull();
  });

  it("usuário de outra empresa responde 404", async () => {
    const admin = await createUser();
    const outsider = await createUser();

    const response = await app.inject({
      method: "DELETE",
      url: `${USERS_URL}/${outsider.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(404);
  });
});

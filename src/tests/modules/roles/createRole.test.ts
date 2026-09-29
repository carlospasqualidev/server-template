import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createRole, createUser, findPermissionIds, findRolePermissionNames } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ROLES_URL = "/api/client/roles";
const MISSING_PERMISSION_ID = "01900000-0000-7000-8000-000000000000";
const GRANT_BEYOND_OWN_MESSAGE = "Você não pode conceder permissões que não possui.";

describe("POST /api/client/roles", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("cria o cargo na empresa e responde 201 com o cargo", async () => {
    const admin = await createUser();
    const permissionIds = await findPermissionIds(["backoffice.users.read", "backoffice.audit.read"]);

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "  Suporte  ", description: "Atendimento", permissionIds },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      message: "Cargo criado.",
      role: {
        id: expect.any(String),
        name: "Suporte",
        description: "Atendimento",
        isSystem: false,
        permissions: [
          { id: permissionIds[1], name: "backoffice.audit.read" },
          { id: permissionIds[0], name: "backoffice.users.read" },
        ],
        usersCount: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });

    const created = await prisma.role.findUniqueOrThrow({ where: { id: response.json().role.id } });
    expect(created).toMatchObject({ companyId: admin.companyId, isSystem: false, deletedAt: null });
  });

  it("escrita de um grupo inclui o read do mesmo grupo, e só dele", async () => {
    const admin = await createUser();
    const permissionIds = await findPermissionIds(["backoffice.users.update", "backoffice.roles.delete"]);

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Editores", permissionIds },
    });

    expect(response.statusCode).toBe(201);
    expect(await findRolePermissionNames(response.json().role.id)).toEqual([
      "backoffice.roles.delete",
      "backoffice.roles.read",
      "backoffice.users.read",
      "backoffice.users.update",
    ]);
  });

  it("só leitura não acrescenta nada, e id repetido conta uma vez", async () => {
    const admin = await createUser();
    const [readId] = await findPermissionIds(["backoffice.users.read"]);

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Leitores", description: "", permissionIds: [readId, readId] },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().role).toMatchObject({ description: null });
    expect(await findRolePermissionNames(response.json().role.id)).toEqual(["backoffice.users.read"]);
  });

  it("nome de cargo existente na empresa responde 409", async () => {
    const admin = await createUser();
    await createRole({ companyId: admin.companyId, name: "Suporte" });

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Suporte", permissionIds: await findPermissionIds(["backoffice.users.read"]) },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "Já existe um cargo com este nome." });
  });

  it("nome de cargo excluído da empresa responde 409 com mensagem própria", async () => {
    const admin = await createUser();
    await createRole({ companyId: admin.companyId, name: "Antigo", deletedAt: new Date() });

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Antigo", permissionIds: await findPermissionIds(["backoffice.users.read"]) },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "Este nome pertence a um cargo excluído. Escolha outro nome." });
  });

  it("o mesmo nome em outra empresa é permitido", async () => {
    const admin = await createUser();
    await createRole({ name: "Suporte" });

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Suporte", permissionIds: await findPermissionIds(["backoffice.users.read"]) },
    });

    expect(response.statusCode).toBe(201);
  });

  it("sem permissões responde 400", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Vazio", permissionIds: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([
      { path: "permissionIds", message: "Selecione ao menos uma permissão para o cargo." },
    ]);
  });

  it("nome ausente e permissão com id inválido respondem 400 com os campos", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { permissionIds: ["nao-e-uuid"] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual(
      expect.arrayContaining([
        { path: "name", message: "Informe o nome." },
        { path: "permissionIds.0", message: "Identificador inválido." },
      ]),
    );
  });

  it("permissão que não existe no catálogo responde 400 e não cria o cargo", async () => {
    const admin = await createUser();
    const [readId] = await findPermissionIds(["backoffice.users.read"]);

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Fantasma", permissionIds: [readId, MISSING_PERMISSION_ID] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Uma ou mais permissões informadas não existem." });
    expect(await prisma.role.count({ where: { name: "Fantasma" } })).toBe(0);
  });

  it("mais permissões que o limite do corpo respondem 400", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "POST",
      url: ROLES_URL,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Enorme", permissionIds: Array.from({ length: 1001 }, () => MISSING_PERMISSION_ID) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "permissionIds", message: "Informe no máximo 1000 permissões." }]);
  });

  describe("anti-escalonamento: ninguém concede permissão que não possui", () => {
    it("permissão fora das do autor responde 403 e não cria o cargo", async () => {
      const actor = await createUser({ permissions: ["backoffice.roles.create", "backoffice.users.read"] });

      const response = await app.inject({
        method: "POST",
        url: ROLES_URL,
        cookies: sessionCookiesFor(actor.id),
        payload: {
          name: "Auditores",
          permissionIds: await findPermissionIds(["backoffice.users.read", "backoffice.audit.read"]),
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: GRANT_BEYOND_OWN_MESSAGE });
      expect(await prisma.role.count({ where: { name: "Auditores" } })).toBe(0);
    });

    it("o read incluído pela expansão também conta", async () => {
      const actor = await createUser({ permissions: ["backoffice.roles.create", "backoffice.users.update"] });

      const response = await app.inject({
        method: "POST",
        url: ROLES_URL,
        cookies: sessionCookiesFor(actor.id),
        payload: { name: "Editores", permissionIds: await findPermissionIds(["backoffice.users.update"]) },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ message: GRANT_BEYOND_OWN_MESSAGE });
    });

    it("autor com todas as permissões do cargo cria", async () => {
      const actor = await createUser({
        permissions: ["backoffice.roles.create", "backoffice.users.read", "backoffice.users.update"],
      });

      const response = await app.inject({
        method: "POST",
        url: ROLES_URL,
        cookies: sessionCookiesFor(actor.id),
        payload: { name: "Editores", permissionIds: await findPermissionIds(["backoffice.users.update"]) },
      });

      expect(response.statusCode).toBe(201);
      expect(await findRolePermissionNames(response.json().role.id)).toEqual([
        "backoffice.users.read",
        "backoffice.users.update",
      ]);
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { assertExists } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSION_CATALOG, PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { withFrozenDate } from "@/tests/helpers/clock";
import { createUser, findAdminRole, findAuditLogs } from "@/tests/helpers/factories";
import { raceAgainstCatalogSync } from "@/tests/helpers/permissionCatalogLock";

const REGISTER_URL = "/api/client/session/register";

describe("POST /api/client/session/register", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("cria empresa e usuário, inicia a sessão e responde 201", async () => {
    const response = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload: { name: "Carla", email: "carla@example.com", password: "senha-forte-1" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      success: true,
      user: {
        id: expect.any(String),
        name: "Carla",
        email: "carla@example.com",
        image: null,
        permissions: [...PERMISSION_NAMES].toSorted(),
        idleTimeoutMinutes: 20,
      },
    });
    expect(response.cookies.find((cookie) => cookie.name === "token")?.value).toBeTruthy();

    const created = await prisma.user.findUnique({ where: { email: "carla@example.com" }, include: { company: true } });
    expect(created?.company.name).toBe("Empresa de Carla");
    expect(created?.password).not.toBe("senha-forte-1");
  });

  it("grava o primeiro acesso em UTC, fora do registro de auditoria da criação", async () => {
    // Relógio da aplicação parado longe de agora: o valor gravado é o `Date` do processo, não o `now()` do banco.
    const registeredAt = new Date("2030-02-20T08:09:10.123Z");

    const response = await withFrozenDate(registeredAt, () =>
      app.inject({
        method: "POST",
        url: REGISTER_URL,
        payload: { name: "Lia", email: "lia@example.com", password: "senha-forte-1" },
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json().user).not.toHaveProperty("lastLoginAt");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "lia@example.com" } });
    expect(user.lastLoginAt).toEqual(registeredAt);
    const [audit] = await findAuditLogs(user.companyId);
    expect(audit).toMatchObject({ action: "create", entityId: user.id });
    expect(audit?.after).not.toHaveProperty("lastLoginAt");
  });

  it("cria o cargo de sistema Administrador da empresa, com o catálogo inteiro, e vincula o usuário", async () => {
    const response = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload: { name: "Dora", email: "dora@example.com", password: "senha-forte-1" },
    });

    expect(response.statusCode).toBe(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "dora@example.com" } });
    const roles = await prisma.role.findMany({
      where: { companyId: user.companyId },
      select: {
        name: true,
        isSystem: true,
        deletedAt: true,
        rolePermissions: { select: { permission: { select: { name: true } } } },
        userRoles: { select: { userId: true } },
      },
    });

    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({ name: "Administrador", isSystem: true, deletedAt: null });
    expect(roles[0]?.rolePermissions.map((item) => item.permission.name).toSorted()).toEqual(
      [...PERMISSION_NAMES].toSorted(),
    );
    expect(roles[0]?.userRoles).toEqual([{ userId: user.id }]);
  });

  it("durante uma sincronização que cria e remove permissões, espera e cria o Administrador com o catálogo novo", async () => {
    const createdByTheSync = PERMISSION_CATALOG.find(
      (definition) => definition.name === "backoffice.systemConfigs.update",
    );
    assertExists(createdByTheSync, "Permissão do catálogo");
    // Estado anterior à versão nova: a permissão que a sincronização vai criar ainda não existe no banco.
    await prisma.permission.delete({ where: { name: createdByTheSync.name } });

    const response = await raceAgainstCatalogSync({
      syncWrite: async (tx) => {
        await tx.permission.create({ data: { ...createdByTheSync } });
        await tx.permission.delete({ where: { name: "backoffice.audit.read" } });
      },
      operation: () =>
        app.inject({
          method: "POST",
          url: REGISTER_URL,
          payload: { name: "Eva", email: "eva@example.com", password: "senha-forte-1" },
        }),
    });

    const expected = PERMISSION_NAMES.filter((permissionName) => permissionName !== "backoffice.audit.read").toSorted();
    expect(response.statusCode).toBe(201);
    expect(response.json().user.permissions).toEqual(expected);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "eva@example.com" } });
    const adminRole = await findAdminRole(user.companyId);
    const adminPermissions = await prisma.rolePermission.findMany({
      where: { roleId: adminRole.id },
      select: { permission: { select: { name: true } } },
    });
    expect(adminPermissions.map((item) => item.permission.name).toSorted()).toEqual(expected);
  });

  it("e-mail já cadastrado responde 409", async () => {
    await createUser({ email: "dup@example.com" });

    const response = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload: { name: "Outra", email: "dup@example.com", password: "senha-forte-1" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "E-mail já cadastrado." });
  });

  it("senha curta responde 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload: { name: "Curta", email: "curta@example.com", password: "123" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([
      { path: "password", message: "A senha precisa ter pelo menos 8 caracteres." },
    ]);
  });
});

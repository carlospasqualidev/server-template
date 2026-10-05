import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { PERMISSION_CATALOG } from "@/modules/permissions/permission.catalog";
import { createAuditLog, createCompany, createSystemConfig, createUser } from "@/tests/helpers/factories";
import { resetDatabase } from "@/tests/setup";

const CATALOG = PERMISSION_CATALOG.map((definition) => ({ ...definition }));

const EMPTY_BUSINESS_TABLES = {
  companies: 0,
  users: 0,
  roles: 0,
  rolePermissions: 0,
  userRoles: 0,
  systemConfigs: 0,
  auditLogs: 0,
};

async function catalogInDatabase() {
  return prisma.permission.findMany({
    select: { name: true, module: true, groupLabel: true, action: true, label: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
}

async function permissionIds(): Promise<string[]> {
  const permissions = await prisma.permission.findMany({ select: { id: true }, orderBy: { id: "asc" } });

  return permissions.map((permission) => permission.id);
}

async function businessRowCounts(): Promise<typeof EMPTY_BUSINESS_TABLES> {
  return {
    companies: await prisma.company.count(),
    users: await prisma.user.count(),
    roles: await prisma.role.count(),
    rolePermissions: await prisma.rolePermission.count(),
    userRoles: await prisma.userRole.count(),
    systemConfigs: await prisma.systemConfig.count(),
    auditLogs: await prisma.auditLog.count(),
  };
}

describe("resetDatabase (src/tests/setup.ts)", () => {
  it("esvazia todas as tabelas de negócio e mantém o catálogo intacto, sem refazê-lo", async () => {
    const company = await createCompany();
    const user = await createUser({ companyId: company.id });
    await createUser({ companyId: company.id, permissions: ["backoffice.users.read"] });
    await createSystemConfig({ companyId: company.id, key: "security.idleTimeoutMinutes", value: "30" });
    await createAuditLog({ companyId: company.id, userId: user.id });
    const idsBefore = await permissionIds();

    expect(Object.values(await businessRowCounts()).every((count) => count > 0)).toBe(true);

    await resetDatabase();

    expect(await businessRowCounts()).toEqual(EMPTY_BUSINESS_TABLES);
    expect(await catalogInDatabase()).toEqual(CATALOG);
    expect(await permissionIds()).toEqual(idsBefore);
  });

  it.each([
    [
      "criada fora do catálogo",
      () =>
        prisma.permission.create({
          data: {
            name: "backoffice.reports.read",
            module: "backoffice",
            groupLabel: "Relatórios",
            action: "read",
            label: "Ver",
          },
        }),
    ],
    ["apagada", () => prisma.permission.delete({ where: { name: "backoffice.users.read" } })],
    [
      "com rótulo alterado",
      () => prisma.permission.update({ where: { name: "backoffice.users.create" }, data: { label: "Rótulo trocado" } }),
    ],
    [
      "com ordem alterada",
      () => prisma.permission.update({ where: { name: "backoffice.users.update" }, data: { sortOrder: -1 } }),
    ],
    [
      "com módulo alterado",
      () => prisma.permission.update({ where: { name: "backoffice.users.delete" }, data: { module: "outro" } }),
    ],
    [
      "com grupo alterado",
      () => prisma.permission.update({ where: { name: "backoffice.users.read" }, data: { groupLabel: "Outro grupo" } }),
    ],
    [
      "com ação alterada",
      () => prisma.permission.update({ where: { name: "backoffice.users.create" }, data: { action: "outra" } }),
    ],
  ])("refaz o catálogo quando um teste deixa uma permissão %s", async (_change, diverge) => {
    await diverge();

    await resetDatabase();

    expect(await catalogInDatabase()).toEqual(CATALOG);
  });
});

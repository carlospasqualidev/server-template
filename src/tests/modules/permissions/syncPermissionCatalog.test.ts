import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { PERMISSION_CATALOG, type PermissionDefinition } from "@/modules/permissions/permission.catalog";
import { syncPermissionCatalogService } from "@/modules/permissions/services/syncPermissionCatalog.service";
import { createCompany, createRole, findAdminRole } from "@/tests/helpers/factories";

const NEW_PERMISSION: PermissionDefinition = {
  name: "backoffice.reports.read",
  module: "backoffice",
  groupLabel: "Relatórios",
  action: "read",
  label: "Visualizar relatórios",
  sortOrder: 50,
};

async function permissionNamesOfRole(roleId: string): Promise<string[]> {
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { name: true } } },
  });

  return rolePermissions.map((rolePermission) => rolePermission.permission.name).toSorted();
}

describe("syncPermissionCatalogService", () => {
  it("deixa no banco o catálogo inteiro, com os metadados do código", async () => {
    const permissions = await prisma.permission.findMany({
      select: { name: true, module: true, groupLabel: true, action: true, label: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    });

    expect(permissions).toEqual(PERMISSION_CATALOG.map((definition) => ({ ...definition })));
  });

  it("rodar de novo não duplica nem altera nada", async () => {
    const company = await createCompany();
    const adminRole = await findAdminRole(company.id);
    const adminPermissionsBefore = await permissionNamesOfRole(adminRole.id);

    const first = await syncPermissionCatalogService();
    const second = await syncPermissionCatalogService();

    expect(first).toEqual({ created: [], updated: [], removed: 0 });
    expect(second).toEqual({ created: [], updated: [], removed: 0 });
    expect(await prisma.permission.count()).toBe(PERMISSION_CATALOG.length);
    expect(await permissionNamesOfRole(adminRole.id)).toEqual(adminPermissionsBefore);
  });

  it("permissão nova é criada e chega só ao cargo Administrador de cada empresa", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const readers = await createRole({ companyId: companyA.id, permissions: ["backoffice.users.read"] });

    const result = await syncPermissionCatalogService({ catalog: [...PERMISSION_CATALOG, NEW_PERMISSION] });

    expect(result.created).toEqual([NEW_PERMISSION.name]);
    expect(await permissionNamesOfRole((await findAdminRole(companyA.id)).id)).toContain(NEW_PERMISSION.name);
    expect(await permissionNamesOfRole((await findAdminRole(companyB.id)).id)).toContain(NEW_PERMISSION.name);
    expect(await permissionNamesOfRole(readers.id)).toEqual(["backoffice.users.read"]);
  });

  it("duas sincronizações simultâneas terminam sem erro, sem duplicar, e só uma cria a permissão nova", async () => {
    const company = await createCompany();
    const catalog = [...PERMISSION_CATALOG, NEW_PERMISSION];
    // Duas conexões já abertas no pool: sem isso a segunda sincronização gasta a abertura da conexão e começa quando
    // a primeira já terminou, e o teste não exercitaria a concorrência.
    await Promise.all([prisma.$queryRaw`SELECT 1`, prisma.$queryRaw`SELECT 1`]);

    const results = await Promise.all([
      syncPermissionCatalogService({ catalog }),
      syncPermissionCatalogService({ catalog }),
    ]);

    // Serializadas pela trava: a segunda já encontra a permissão criada pela primeira.
    expect(results.flatMap((result) => result.created)).toEqual([NEW_PERMISSION.name]);
    expect(await prisma.permission.count()).toBe(catalog.length);
    expect(
      await prisma.rolePermission.count({
        where: { roleId: (await findAdminRole(company.id)).id, permission: { name: NEW_PERMISSION.name } },
      }),
    ).toBe(1);
  });

  it("permissão retirada à mão de um cargo não volta", async () => {
    const editors = await createRole({ permissions: ["backoffice.users.read", "backoffice.users.update"] });
    await prisma.rolePermission.deleteMany({
      where: { roleId: editors.id, permission: { name: "backoffice.users.update" } },
    });

    await syncPermissionCatalogService();

    expect(await permissionNamesOfRole(editors.id)).toEqual(["backoffice.users.read"]);
  });

  it("atualiza os metadados que mudaram no código", async () => {
    const catalog = PERMISSION_CATALOG.map((definition) =>
      definition.name === "backoffice.users.read" ? { ...definition, label: "Consultar usuários" } : definition,
    );

    const result = await syncPermissionCatalogService({ catalog });

    expect(result.updated).toEqual(["backoffice.users.read"]);
    expect(await prisma.permission.findUnique({ where: { name: "backoffice.users.read" } })).toMatchObject({
      label: "Consultar usuários",
    });
  });

  it("remove as permissões obsoletas, inclusive dos cargos", async () => {
    const company = await createCompany();
    await syncPermissionCatalogService({ catalog: [...PERMISSION_CATALOG, NEW_PERMISSION] });

    const result = await syncPermissionCatalogService({ obsoleteNames: [NEW_PERMISSION.name] });

    expect(result.removed).toBe(1);
    expect(await prisma.permission.findUnique({ where: { name: NEW_PERMISSION.name } })).toBeNull();
    expect(await permissionNamesOfRole((await findAdminRole(company.id)).id)).not.toContain(NEW_PERMISSION.name);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { PERMISSION_CATALOG } from "@/modules/permissions/permission.catalog";
import { syncPermissionCatalogService } from "@/modules/permissions/services/syncPermissionCatalog.service";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const CATALOG_URL = "/api/client/roles/permissions";

interface CatalogResponse {
  modules: { module: string; moduleLabel: string; groups: { groupLabel: string; permissions: { name: string }[] }[] }[];
}

describe("GET /api/client/roles/permissions", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("devolve o catálogo em árvore módulo → grupo → permissões, na ordem de sortOrder", async () => {
    const user = await createUser({ permissions: ["backoffice.roles.read"] });
    const usersRead = await prisma.permission.findUniqueOrThrow({ where: { name: "backoffice.users.read" } });

    const response = await app.inject({ method: "GET", url: CATALOG_URL, cookies: sessionCookiesFor(user.id) });

    expect(response.statusCode).toBe(200);
    const { modules } = response.json<CatalogResponse>();
    expect(modules.map(({ module, moduleLabel }) => ({ module, moduleLabel }))).toEqual([
      { module: "backoffice", moduleLabel: "Backoffice" },
    ]);
    expect(modules[0]?.groups.map((group) => group.groupLabel)).toEqual([
      "Usuários",
      "Cargos",
      "Auditoria",
      "Configurações",
    ]);
    expect(modules[0]?.groups[0]).toEqual({
      groupLabel: "Usuários",
      permissions: [
        { id: usersRead.id, name: "backoffice.users.read", action: "read", label: "Visualizar usuários" },
        { id: expect.any(String), name: "backoffice.users.create", action: "create", label: "Criar usuário" },
        { id: expect.any(String), name: "backoffice.users.update", action: "update", label: "Editar usuário" },
        { id: expect.any(String), name: "backoffice.users.delete", action: "delete", label: "Excluir usuário" },
      ],
    });
    const listedNames = modules.flatMap((module) =>
      module.groups.flatMap((group) => group.permissions.map((permission) => permission.name)),
    );
    expect(listedNames.toSorted()).toEqual(PERMISSION_CATALOG.map((definition) => definition.name).toSorted());
  });

  it("ordena grupos por sortOrder e põe no fim, rotulado pelo nome, o módulo sem rótulo", async () => {
    await syncPermissionCatalogService({
      catalog: [
        ...PERMISSION_CATALOG,
        {
          name: "reports.sales.read",
          module: "reports",
          groupLabel: "Vendas",
          action: "read",
          label: "Visualizar vendas",
          sortOrder: 1,
        },
        {
          name: "backoffice.reports.read",
          module: "backoffice",
          groupLabel: "Relatórios",
          action: "read",
          label: "Visualizar relatórios",
          sortOrder: 5,
        },
      ],
    });
    const user = await createUser({ permissions: ["backoffice.roles.read"] });

    const response = await app.inject({ method: "GET", url: CATALOG_URL, cookies: sessionCookiesFor(user.id) });

    const { modules } = response.json<CatalogResponse>();
    expect(modules.map(({ module, moduleLabel }) => ({ module, moduleLabel }))).toEqual([
      { module: "backoffice", moduleLabel: "Backoffice" },
      { module: "reports", moduleLabel: "reports" },
    ]);
    expect(modules[0]?.groups.at(0)?.groupLabel).toBe("Relatórios");
    expect(modules[1]?.groups).toEqual([
      {
        groupLabel: "Vendas",
        permissions: [
          { id: expect.any(String), name: "reports.sales.read", action: "read", label: "Visualizar vendas" },
        ],
      },
    ]);
  });
});

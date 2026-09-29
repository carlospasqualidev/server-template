import { describe, expect, it } from "vitest";

import { OBSOLETE_PERMISSION_NAMES, PERMISSION_CATALOG } from "@/modules/permissions/permission.catalog";

describe("PERMISSION_CATALOG", () => {
  it("tem as permissões do backoffice previstas", () => {
    expect(PERMISSION_CATALOG.map((definition) => definition.name)).toEqual([
      "backoffice.users.read",
      "backoffice.users.create",
      "backoffice.users.update",
      "backoffice.users.delete",
      "backoffice.roles.read",
      "backoffice.roles.create",
      "backoffice.roles.update",
      "backoffice.roles.delete",
      "backoffice.audit.read",
      "backoffice.systemConfigs.read",
      "backoffice.systemConfigs.update",
    ]);
  });

  it("segue modulo.entidade.acao, coerente com module e action", () => {
    for (const definition of PERMISSION_CATALOG) {
      const [module, entity, action, ...rest] = definition.name.split(".");

      expect(rest).toEqual([]);
      expect(module).toBe(definition.module);
      expect(entity).toMatch(/^[a-z][a-zA-Z]*$/);
      expect(action).toBe(definition.action);
      expect(definition.label).not.toBe("");
      expect(definition.groupLabel).not.toBe("");
    }
  });

  it("não repete nome nem ordem e não mistura nomes obsoletos", () => {
    const names = PERMISSION_CATALOG.map((definition) => definition.name);
    const sortOrders = PERMISSION_CATALOG.map((definition) => definition.sortOrder);

    expect(new Set(names).size).toBe(names.length);
    expect(new Set(sortOrders).size).toBe(sortOrders.length);
    expect(names.filter((name) => OBSOLETE_PERMISSION_NAMES.includes(name))).toEqual([]);
  });
});

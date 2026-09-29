import { describe, expect, expectTypeOf, it } from "vitest";

import { getSystemConfigValueService } from "@/modules/systemConfigs/services/getSystemConfigValue.service";
import { createCompany, createSystemConfig } from "@/tests/helpers/factories";

describe("getSystemConfigValueService", () => {
  it("sem valor gravado devolve o padrão do catálogo, no tipo da chave", async () => {
    const company = await createCompany();

    const minutes = await getSystemConfigValueService({ companyId: company.id, key: "security.idleTimeoutMinutes" });
    const emailNotifications = await getSystemConfigValueService({ companyId: company.id, key: "notifications.email" });
    const appName = await getSystemConfigValueService({ companyId: company.id, key: "app.name" });

    expect(minutes).toBe(20);
    expect(emailNotifications).toBe(true);
    expect(appName).toBe("Meu Produto");
    expectTypeOf(minutes).toEqualTypeOf<number>();
    expectTypeOf(emailNotifications).toEqualTypeOf<boolean>();
    expectTypeOf(appName).toEqualTypeOf<string>();
  });

  it("devolve o valor gravado pela empresa, convertido", async () => {
    const company = await createCompany();
    await createSystemConfig({ companyId: company.id, key: "security.idleTimeoutMinutes", value: "90" });
    await createSystemConfig({ companyId: company.id, key: "notifications.email", value: "false" });

    expect(await getSystemConfigValueService({ companyId: company.id, key: "security.idleTimeoutMinutes" })).toBe(90);
    expect(await getSystemConfigValueService({ companyId: company.id, key: "notifications.email" })).toBe(false);
  });

  it("não lê o valor de outra empresa", async () => {
    const company = await createCompany();
    const otherCompany = await createCompany();
    await createSystemConfig({ companyId: otherCompany.id, key: "security.idleTimeoutMinutes", value: "90" });

    expect(await getSystemConfigValueService({ companyId: company.id, key: "security.idleTimeoutMinutes" })).toBe(20);
  });

  it("valor gravado que não passa mais pela regra vale o padrão", async () => {
    const company = await createCompany();
    await createSystemConfig({ companyId: company.id, key: "security.idleTimeoutMinutes", value: "9999" });

    expect(await getSystemConfigValueService({ companyId: company.id, key: "security.idleTimeoutMinutes" })).toBe(20);
  });
});

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { recordLastLoginService } from "@/modules/session/services/recordLastLogin.service";
import { createCompany, createUser } from "@/tests/helpers/factories";

describe("recordLastLoginService", () => {
  it("não grava o último acesso de usuário excluído logicamente", async () => {
    const company = await createCompany();
    const active = await createUser({ companyId: company.id });
    const deleted = await createUser({ companyId: company.id, deletedAt: new Date() });

    await prisma.$transaction(async (tx) => {
      await recordLastLoginService({ companyId: company.id, userId: active.id }, tx);
      await recordLastLoginService({ companyId: company.id, userId: deleted.id }, tx);
    });

    const stored = await prisma.user.findMany({
      where: { id: { in: [active.id, deleted.id] } },
      select: { id: true, lastLoginAt: true },
    });
    const lastLoginById = new Map(stored.map((row) => [row.id, row.lastLoginAt]));

    expect(lastLoginById.get(active.id)).toBeInstanceOf(Date);
    expect(lastLoginById.get(deleted.id)).toBeNull();
  });
});

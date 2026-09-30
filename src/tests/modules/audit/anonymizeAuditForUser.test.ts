import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { anonymizeAuditForUserService } from "@/modules/audit/services/anonymizeAuditForUser.service";
import { withFrozenDate } from "@/tests/helpers/clock";
import { createAuditLog, createCompany, createUser } from "@/tests/helpers/factories";

const REQUESTED_AT = new Date("2026-09-20T12:00:00.000Z");

async function findAuditLog(id: string) {
  return prisma.auditLog.findUnique({ where: { id } });
}

describe("anonymizeAuditForUserService", () => {
  it("anonimiza já os eventos em que o usuário é autor ou o registro afetado, e só eles", async () => {
    const holder = await createUser({ name: "Maria Alves", email: "maria@example.com" });
    const colleague = await createUser({ companyId: holder.companyId });
    const personal = { name: "Maria Alves", email: "maria@example.com", image: null, phone: "48999999999" };

    // Autor: editou um cargo (sem campo pessoal) e outro usuário.
    const roleByHolder = await createAuditLog({
      companyId: holder.companyId,
      module: "SECURITY",
      entity: "Role",
      entityId: "0192f0aa-0000-7000-8000-00000000000a",
      action: "update",
      description: 'Editou o cargo "Financeiro".',
      changedFields: ["name"],
      before: { name: "Finanças" },
      after: { name: "Financeiro" },
      userId: holder.id,
      ip: "10.0.0.1",
      userAgent: "Mozilla/5.0",
    });
    const colleagueByHolder = await createAuditLog({
      companyId: holder.companyId,
      entity: "User",
      entityId: colleague.id,
      action: "update",
      description: `Editou o usuário "${colleague.name}".`,
      changedFields: ["phone"],
      before: { name: colleague.name, phone: null },
      after: { name: colleague.name, phone: "48988887777" },
      userId: holder.id,
    });
    // Alvo: um colega editou o cadastro dele; o próprio login.
    const holderByColleague = await createAuditLog({
      companyId: holder.companyId,
      entity: "User",
      entityId: holder.id,
      action: "update",
      description: 'Editou o usuário "Maria Alves".',
      changedFields: ["phone"],
      before: { ...personal, phone: null },
      after: personal,
      userId: colleague.id,
      ip: "10.0.0.2",
    });
    const holderLogin = await createAuditLog({
      companyId: holder.companyId,
      module: "SECURITY",
      entity: "User",
      entityId: holder.id,
      action: "login",
      description: "Entrou no sistema.",
      userId: holder.id,
    });
    // Fora: evento só do colega, e o mesmo id noutra empresa.
    const colleagueOnly = await createAuditLog({
      companyId: holder.companyId,
      entity: "User",
      entityId: colleague.id,
      action: "delete",
      description: `Excluiu o usuário "${colleague.name}".`,
      before: { name: colleague.name },
      userId: colleague.id,
    });
    const otherCompany = await createCompany();
    const otherCompanyLog = await createAuditLog({
      companyId: otherCompany.id,
      entity: "User",
      entityId: holder.id,
      action: "update",
      description: 'Editou o usuário "Maria Alves".',
      changedFields: ["name"],
      before: { name: "Maria" },
      after: { name: "Maria Alves" },
    });

    const result = await withFrozenDate(REQUESTED_AT, () =>
      anonymizeAuditForUserService({ companyId: holder.companyId, userId: holder.id }),
    );

    expect(result).toEqual({ anonymized: 4 });
    expect(await findAuditLog(roleByHolder.id)).toEqual({
      ...roleByHolder,
      userId: null,
      ip: null,
      userAgent: null,
      description: "Editou um cargo.",
      anonymizedAt: REQUESTED_AT,
    });
    // O colega editado por ela também perde o nome e o telefone: o evento sai inteiro anonimizado.
    expect(await findAuditLog(colleagueByHolder.id)).toEqual({
      ...colleagueByHolder,
      userId: null,
      description: "Editou um usuário.",
      before: { name: "[omitido]", phone: null },
      after: { name: "[omitido]", phone: "[omitido]" },
      anonymizedAt: REQUESTED_AT,
    });
    expect(await findAuditLog(holderByColleague.id)).toEqual({
      ...holderByColleague,
      userId: null,
      ip: null,
      description: "Editou um usuário.",
      before: { name: "[omitido]", email: "[omitido]", image: null, phone: null },
      after: { name: "[omitido]", email: "[omitido]", image: null, phone: "[omitido]" },
      anonymizedAt: REQUESTED_AT,
    });
    // O `entityId` continua: é o id, não o dado pessoal.
    expect(await findAuditLog(holderLogin.id)).toEqual({
      ...holderLogin,
      userId: null,
      anonymizedAt: REQUESTED_AT,
    });
    expect(await findAuditLog(colleagueOnly.id)).toEqual(colleagueOnly);
    expect(await findAuditLog(otherCompanyLog.id)).toEqual(otherCompanyLog);
  });

  it("é idempotente: o evento já anonimizado não é tocado de novo", async () => {
    const holder = await createUser();
    const log = await createAuditLog({
      companyId: holder.companyId,
      entity: "User",
      entityId: holder.id,
      action: "update",
      description: 'Editou o usuário "X".',
      changedFields: ["name"],
      before: { name: "X" },
      after: { name: "Y" },
      userId: holder.id,
    });

    const first = await withFrozenDate(REQUESTED_AT, () =>
      anonymizeAuditForUserService({ companyId: holder.companyId, userId: holder.id }),
    );
    const afterFirst = await findAuditLog(log.id);
    const second = await anonymizeAuditForUserService({ companyId: holder.companyId, userId: holder.id });

    expect([first, second]).toEqual([{ anonymized: 1 }, { anonymized: 0 }]);
    expect(await findAuditLog(log.id)).toEqual(afterFirst);
    expect(afterFirst?.anonymizedAt).toEqual(REQUESTED_AT);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import {
  AUDIT_RETENTION_LOCK_NAME,
  runAuditRetentionService,
} from "@/modules/audit/services/runAuditRetention.service";
import { createTestApp } from "@/tests/helpers/app";
import { withFrozenDate } from "@/tests/helpers/clock";
import {
  createAuditLog,
  createCompany,
  createSystemConfig,
  createUser,
  findAuditLogs,
} from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

/** Referência das execuções. Dia 15: nenhum mês de destino fica sem o dia, e o corte é exato em meses. */
const NOW = new Date("2026-09-15T03:00:00.000Z");

/** `NOW` menos `months` meses do calendário, em UTC (o corte de um prazo de `months` meses). */
function monthsAgo(months: number): Date {
  const date = new Date(NOW);
  date.setUTCMonth(date.getUTCMonth() - months);

  return date;
}

/** Um instante antes de `date`: já passou do prazo que corta em `date`. */
function justBefore(date: Date): Date {
  return new Date(date.getTime() - 1);
}

const USER_BEFORE = {
  name: "Maria",
  email: "maria@example.com",
  image: null,
  phone: null,
  isActive: true,
  idleTimeoutMinutes: 30,
};

const USER_AFTER = {
  name: "Maria Alves",
  email: "maria@example.com",
  image: null,
  phone: "48999999999",
  isActive: true,
  idleTimeoutMinutes: 30,
};

/** Edição de usuário com autor, metadados da requisição e dados pessoais, como a trilha grava. */
async function createUserUpdateLog(companyId: string, createdAt: Date, authorId: string | null = null) {
  return createAuditLog({
    companyId,
    module: "USERS",
    entity: "User",
    entityId: "0192f0aa-0000-7000-8000-000000000001",
    action: "update",
    description: 'Editou o usuário "Maria Alves".',
    changedFields: ["name", "phone"],
    before: USER_BEFORE,
    after: USER_AFTER,
    userId: authorId,
    requestId: "req-1",
    ip: "10.0.0.1",
    userAgent: "Mozilla/5.0",
    createdAt,
  });
}

async function findAuditLog(id: string) {
  return prisma.auditLog.findUnique({ where: { id } });
}
/** Mantém a trava da retenção numa transação enquanto `run` executa: é "outra instância" rodando. */
async function whileAnotherRunHoldsTheLock<T>(run: () => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${AUDIT_RETENTION_LOCK_NAME}))`;

    return run();
  });
}

describe("runAuditRetentionService", () => {
  it("evento dentro do prazo de anonimização fica intacto; o que passou do corte é anonimizado", async () => {
    const author = await createUser();
    const atCutoff = await createUserUpdateLog(author.companyId, monthsAgo(12), author.id);
    const recent = await createUserUpdateLog(author.companyId, monthsAgo(1), author.id);
    const expired = await createUserUpdateLog(author.companyId, justBefore(monthsAgo(12)), author.id);

    const result = await runAuditRetentionService({ now: NOW });

    expect(result).toEqual({ skipped: false, companies: 1, anonymized: 1, deleted: 0, interrupted: null });
    expect(await findAuditLog(atCutoff.id)).toEqual(atCutoff);
    expect(await findAuditLog(recent.id)).toEqual(recent);
    expect(await findAuditLog(expired.id)).not.toEqual(expired);
  });

  it("anonimiza: autor, IP e user-agent nulos, campos pessoais [omitido], frase genérica; o resto fica", async () => {
    const author = await createUser();
    const log = await createUserUpdateLog(author.companyId, monthsAgo(13), author.id);

    await runAuditRetentionService({ now: NOW });

    expect(await findAuditLog(log.id)).toEqual({
      ...log,
      userId: null,
      ip: null,
      userAgent: null,
      description: "Editou um usuário.",
      // Troca o valor sem tirar a chave; `null` continua `null` (ausência de dado não é dado).
      before: {
        name: "[omitido]",
        email: "[omitido]",
        image: null,
        phone: null,
        isActive: true,
        idleTimeoutMinutes: 30,
      },
      after: {
        name: "[omitido]",
        email: "[omitido]",
        image: null,
        phone: "[omitido]",
        isActive: true,
        idleTimeoutMinutes: 30,
      },
      anonymizedAt: NOW,
    });
  });

  it("anonimiza uma vez só: a execução seguinte não reprocessa nem recontabiliza o evento", async () => {
    const company = await createCompany();
    const log = await createUserUpdateLog(company.id, monthsAgo(13));

    const first = await runAuditRetentionService({ now: NOW });
    const afterFirst = await findAuditLog(log.id);
    const second = await runAuditRetentionService({ now: new Date(NOW.getTime() + 24 * 60 * 60 * 1000) });

    expect(first.anonymized).toBe(1);
    expect(second.anonymized).toBe(0);
    expect(await findAuditLog(log.id)).toEqual(afterFirst);
    expect(afterFirst?.anonymizedAt).toEqual(NOW);
  });

  it("evento mais velho que o prazo de exclusão é apagado; o de antes do corte só é anonimizado", async () => {
    const company = await createCompany();
    const expired = await createUserUpdateLog(company.id, justBefore(monthsAgo(60)));
    const kept = await createUserUpdateLog(company.id, monthsAgo(60));

    const result = await runAuditRetentionService({ now: NOW });

    expect(result).toEqual({ skipped: false, companies: 1, anonymized: 1, deleted: 1, interrupted: null });
    expect(await findAuditLog(expired.id)).toBeNull();
    expect(await findAuditLog(kept.id)).toEqual(expect.objectContaining({ anonymizedAt: NOW }));
  });

  it("cada empresa usa os próprios prazos; sem configuração, os padrões (12 e 60 meses)", async () => {
    const strict = await createCompany();
    await createSystemConfig({ companyId: strict.id, key: "audit.anonymizeAfterMonths", value: "1" });
    await createSystemConfig({ companyId: strict.id, key: "audit.deleteAfterMonths", value: "2" });
    const standard = await createCompany();

    const strictDeleted = await createUserUpdateLog(strict.id, monthsAgo(3));
    const strictAnonymized = await createUserUpdateLog(strict.id, justBefore(monthsAgo(1)));
    const strictRecent = await createUserUpdateLog(strict.id, monthsAgo(0));
    const standardOld = await createUserUpdateLog(standard.id, monthsAgo(3));
    const standardAnonymized = await createUserUpdateLog(standard.id, monthsAgo(24));
    const standardDeleted = await createUserUpdateLog(standard.id, monthsAgo(61));

    const result = await runAuditRetentionService({ now: NOW });

    expect(result).toEqual({ skipped: false, companies: 2, anonymized: 2, deleted: 2, interrupted: null });
    expect(await findAuditLog(strictDeleted.id)).toBeNull();
    expect(await findAuditLog(strictAnonymized.id)).toEqual(expect.objectContaining({ anonymizedAt: NOW }));
    expect(await findAuditLog(strictRecent.id)).toEqual(strictRecent);
    expect(await findAuditLog(standardOld.id)).toEqual(standardOld);
    expect(await findAuditLog(standardAnonymized.id)).toEqual(expect.objectContaining({ anonymizedAt: NOW }));
    expect(await findAuditLog(standardDeleted.id)).toBeNull();
  });

  it("frase genérica de cada entidade e ação; só os campos pessoais da entidade mudam", async () => {
    const company = await createCompany();
    const old = monthsAgo(13);
    const roleUpdate = await createAuditLog({
      companyId: company.id,
      module: "SECURITY",
      entity: "Role",
      action: "update",
      description: 'Editou o cargo "Financeiro".',
      changedFields: ["name"],
      before: { name: "Finanças", description: null, permissions: "backoffice.users.read" },
      after: { name: "Financeiro", description: null, permissions: "backoffice.users.read" },
      createdAt: old,
    });
    const configUpdate = await createAuditLog({
      companyId: company.id,
      module: "SETTINGS",
      entity: "SystemConfig",
      entityId: "app.name",
      action: "update",
      description: 'Alterou a configuração "Nome da aplicação".',
      changedFields: ["value"],
      before: { value: "Meu Produto" },
      after: { value: "Painel" },
      createdAt: old,
    });
    const userCreate = await createAuditLog({
      companyId: company.id,
      entity: "User",
      action: "create",
      description: 'Criou o usuário "Maria Alves".',
      after: USER_AFTER,
      createdAt: old,
    });
    const statusChange = await createAuditLog({
      companyId: company.id,
      module: "SECURITY",
      entity: "User",
      action: "statusChange",
      description: 'Bloqueou o usuário "Maria Alves".',
      changedFields: ["isActive"],
      before: { isActive: true },
      after: { isActive: false },
      createdAt: old,
    });
    const login = await createAuditLog({
      companyId: company.id,
      module: "SECURITY",
      entity: "User",
      action: "login",
      description: "Entrou no sistema.",
      createdAt: old,
    });
    const exported = await createAuditLog({
      companyId: company.id,
      entity: "User",
      action: "export",
      description: "Exportou a lista de usuários em CSV.",
      after: { busca: "ana@example.com", cargos: "Suporte, Financeiro", ativo: true, formato: "CSV" },
      createdAt: old,
    });

    await runAuditRetentionService({ now: NOW });

    expect(await findAuditLog(roleUpdate.id)).toEqual({
      ...roleUpdate,
      description: "Editou um cargo.",
      anonymizedAt: NOW,
    });
    expect(await findAuditLog(configUpdate.id)).toEqual({
      ...configUpdate,
      description: "Editou uma configuração.",
      anonymizedAt: NOW,
    });
    // Sem `before`, a coluna continua nula (não vira o JSON `null`).
    expect(await findAuditLog(userCreate.id)).toEqual({
      ...userCreate,
      description: "Criou um usuário.",
      after: { ...USER_AFTER, name: "[omitido]", email: "[omitido]", phone: "[omitido]" },
      anonymizedAt: NOW,
    });
    expect(
      await prisma.$queryRaw`SELECT before IS NULL AS "isNull" FROM audit_logs WHERE id = ${userCreate.id}`,
    ).toEqual([{ isNull: true }]);
    expect(await findAuditLog(statusChange.id)).toEqual({
      ...statusChange,
      description: "Alterou o status de um usuário.",
      anonymizedAt: NOW,
    });
    expect(await findAuditLog(login.id)).toEqual({ ...login, description: "Entrou no sistema.", anonymizedAt: NOW });
    // Na exportação, o termo de busca (texto livre: pode ser um nome ou um e-mail) é omitido; os demais filtros ficam.
    expect(await findAuditLog(exported.id)).toEqual({
      ...exported,
      description: "Exportou a lista de usuários.",
      after: { busca: "[omitido]", cargos: "Suporte, Financeiro", ativo: true, formato: "CSV" },
      anonymizedAt: NOW,
    });
  });

  it("configuração marcada como dado pessoal perde o valor; a não marcada o mantém", async () => {
    const company = await createCompany();
    const configLog = (key: string, before: string, after: string) =>
      createAuditLog({
        companyId: company.id,
        module: "SETTINGS",
        entity: "SystemConfig",
        entityId: key,
        action: "update",
        description: "Alterou a configuração.",
        changedFields: ["value"],
        before: { value: before },
        after: { value: after },
        createdAt: monthsAgo(13),
      });
    const supportEmail = await configLog("app.supportEmail", "suporte@example.com", "maria@example.com");
    const appName = await configLog("app.name", "Meu Produto", "Painel da Maria");
    // Chave que saiu do catálogo: não se sabe se é pessoal, o valor fica.
    const legacyKey = await configLog("app.oldContact", "joao@example.com", "maria@example.com");

    await runAuditRetentionService({ now: NOW });

    expect(await findAuditLog(supportEmail.id)).toEqual({
      ...supportEmail,
      description: "Editou uma configuração.",
      before: { value: "[omitido]" },
      after: { value: "[omitido]" },
      anonymizedAt: NOW,
    });
    expect(await findAuditLog(appName.id)).toEqual({
      ...appName,
      description: "Editou uma configuração.",
      anonymizedAt: NOW,
    });
    expect(await findAuditLog(legacyKey.id)).toEqual({
      ...legacyKey,
      description: "Editou uma configuração.",
      anonymizedAt: NOW,
    });
  });

  it("entidade fora do catálogo perde a frase (pode ter um nome) e mantém before/after", async () => {
    const company = await createCompany();
    const legacy = await createAuditLog({
      companyId: company.id,
      entity: "Invoice",
      action: "update",
      description: 'Editou a fatura "Maria Alves".',
      changedFields: ["total"],
      before: { total: 10 },
      after: { total: 12 },
      ip: "10.0.0.1",
      createdAt: monthsAgo(13),
    });

    await runAuditRetentionService({ now: NOW });

    expect(await findAuditLog(legacy.id)).toEqual({ ...legacy, description: null, ip: null, anonymizedAt: NOW });
  });

  it("percorre empresas e eventos em lotes até esvaziar", async () => {
    const companies = [await createCompany(), await createCompany(), await createCompany()];

    for (const company of companies) {
      for (let index = 0; index < 3; index += 1) {
        await createUserUpdateLog(company.id, monthsAgo(13));
        await createUserUpdateLog(company.id, monthsAgo(61));
      }
    }

    const result = await runAuditRetentionService({ now: NOW, batchSize: 2 });

    expect(result).toEqual({ skipped: false, companies: 3, anonymized: 9, deleted: 9, interrupted: null });

    for (const company of companies) {
      expect(await findAuditLogs(company.id)).toEqual(
        Array.from({ length: 3 }, () => expect.objectContaining({ anonymizedAt: NOW, userId: null, ip: null })),
      );
    }
  });

  it("com outra execução em andamento (trava tomada), volta sem fazer nada", async () => {
    const company = await createCompany();
    const expired = await createUserUpdateLog(company.id, monthsAgo(13));
    const tooOld = await createUserUpdateLog(company.id, monthsAgo(61));

    const result = await whileAnotherRunHoldsTheLock(() => runAuditRetentionService({ now: NOW }));

    expect(result).toEqual({ skipped: true, companies: 0, anonymized: 0, deleted: 0, interrupted: null });
    expect(await findAuditLog(expired.id)).toEqual(expired);
    expect(await findAuditLog(tooOld.id)).toEqual(tooOld);

    // Solta a trava, a próxima execução faz o trabalho.
    expect(await runAuditRetentionService({ now: NOW })).toEqual({
      skipped: false,
      companies: 1,
      anonymized: 1,
      deleted: 1,
      interrupted: null,
    });
  });

  it("passado o tempo de trabalho, para entre dois lotes com as contagens do que fez; a seguinte continua dali", async () => {
    const companies = [await createCompany(), await createCompany()];

    for (const company of companies) {
      for (let index = 0; index < 3; index += 1) {
        await createUserUpdateLog(company.id, monthsAgo(61));
      }
      await createUserUpdateLog(company.id, monthsAgo(13));
    }

    // Tempo zero: já vencido no primeiro intervalo. O primeiro lote roda assim mesmo (toda execução avança).
    const interrupted = await runAuditRetentionService({ now: NOW, batchSize: 2, timeLimitMs: 0 });

    expect(interrupted).toEqual({
      skipped: false,
      companies: 1,
      anonymized: 0,
      deleted: 2,
      interrupted: "timeLimit",
    });
    // Um lote na primeira empresa percorrida (2 dos 3 vencidos); a outra, intocada.
    const remaining = await Promise.all(companies.map(async (company) => (await findAuditLogs(company.id)).length));
    expect(remaining.sort((a, b) => a - b)).toEqual([2, 4]);

    // A trava foi solta (a execução terminou a transação dela), e a seguinte faz o resto, sem repetir nada.
    expect(await runAuditRetentionService({ now: NOW, batchSize: 2 })).toEqual({
      skipped: false,
      companies: 2,
      anonymized: 2,
      deleted: 4,
      interrupted: null,
    });

    for (const company of companies) {
      expect(await findAuditLogs(company.id)).toEqual([expect.objectContaining({ anonymizedAt: NOW })]);
    }
  });

  it("com o pedido de parada (encerramento do servidor), para entre dois lotes e diz por quê", async () => {
    const company = await createCompany();

    for (let index = 0; index < 3; index += 1) {
      await createUserUpdateLog(company.id, monthsAgo(61));
    }

    const result = await runAuditRetentionService({ now: NOW, batchSize: 2, signal: AbortSignal.abort() });

    expect(result).toEqual({ skipped: false, companies: 1, anonymized: 0, deleted: 2, interrupted: "aborted" });
    expect(await findAuditLogs(company.id)).toHaveLength(1);
  });

  it("duas execuções simultâneas não duplicam trabalho", async () => {
    const companies = [await createCompany(), await createCompany()];

    for (const company of companies) {
      for (let index = 0; index < 4; index += 1) {
        await createUserUpdateLog(company.id, monthsAgo(13));
      }
      await createUserUpdateLog(company.id, monthsAgo(61));
    }

    const later = new Date(NOW.getTime() + 60 * 1000);
    const [first, second] = await Promise.all([
      runAuditRetentionService({ now: NOW, batchSize: 2 }),
      runAuditRetentionService({ now: later, batchSize: 2 }),
    ]);

    expect(first.anonymized + second.anonymized).toBe(8);
    expect(first.deleted + second.deleted).toBe(2);

    // Cada evento foi anonimizado por uma execução só: todos com a mesma marca, a de quem trabalhou.
    const logs = await prisma.auditLog.findMany({ select: { anonymizedAt: true } });
    expect(logs).toHaveLength(8);
    expect(new Set(logs.map((log) => log.anonymizedAt?.toISOString())).size).toBe(1);
  });

  describe("com eventos gravados pelas mutações", () => {
    let app: App;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it("a criação de um usuário feita há 13 meses sai anonimizada; a de agora fica", async () => {
      const admin = await createUser();
      const payload = {
        email: "marina@example.com",
        password: "senha-forte-1",
        confirmPassword: "senha-forte-1",
        phone: "48999999999",
      };

      const oldResponse = await withFrozenDate(monthsAgo(13), () =>
        app.inject({
          method: "POST",
          url: "/api/client/users",
          cookies: sessionCookiesFor(admin.id),
          headers: { "user-agent": "vitest-agent" },
          payload: { ...payload, name: "Marina Alves" },
        }),
      );
      const recentResponse = await app.inject({
        method: "POST",
        url: "/api/client/users",
        cookies: sessionCookiesFor(admin.id),
        payload: { ...payload, name: "Joana Lima", email: "joana@example.com" },
      });
      expect([oldResponse.statusCode, recentResponse.statusCode]).toEqual([201, 201]);

      await runAuditRetentionService({ now: NOW });

      const [oldLog, recentLog] = await findAuditLogs(admin.companyId);
      expect(oldLog).toEqual(
        expect.objectContaining({
          entityId: oldResponse.json().user.id,
          action: "create",
          description: "Criou um usuário.",
          after: {
            name: "[omitido]",
            email: "[omitido]",
            image: null,
            phone: "[omitido]",
            isActive: true,
            idleTimeoutMinutes: null,
          },
          userId: null,
          ip: null,
          userAgent: null,
          createdAt: monthsAgo(13),
          anonymizedAt: NOW,
        }),
      );
      expect(recentLog).toEqual(
        expect.objectContaining({
          description: 'Criou o usuário "Joana Lima".',
          userId: admin.id,
          ip: "127.0.0.1",
          anonymizedAt: null,
        }),
      );
    });
  });
});

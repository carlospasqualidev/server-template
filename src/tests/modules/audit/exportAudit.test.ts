import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { type App, buildApp } from "@/app";
import { requireSession } from "@/hooks/requireSession";
import { getAuthenticatedUser } from "@/lib/auth/authenticatedUser";
import { prisma } from "@/lib/prisma";
import { AUDIT_EXPORT_FORMATS } from "@/modules/audit/audit.catalog";
import { recordExportAuditService } from "@/modules/audit/services/recordExportAudit.service";
import { createCompany, createUser, findAuditLogs } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

/** Rota de exportação que existe só neste teste (o template ainda não tem uma real), no formato que a regra pede. */
const EXPORT_URL = "/test-only/users/export";

const exportQuerySchema = z.object({
  search: z.string().optional(),
  format: z.enum(AUDIT_EXPORT_FORMATS).default("CSV"),
});

async function createAppWithExportRoute(): Promise<App> {
  const app = buildApp();

  app.register(async (routes) => {
    const protectedRoutes = routes.withTypeProvider<ZodTypeProvider>();

    protectedRoutes.addHook("onRequest", requireSession);
    protectedRoutes.get(EXPORT_URL, { schema: { querystring: exportQuerySchema } }, async (request, reply) => {
      const { companyId } = getAuthenticatedUser(request);
      const { search, format } = request.query;
      const file = "nome\nAna\n";

      // Depois de montar o arquivo e antes de responder: exportação que falha antes daqui não é registrada.
      await recordExportAuditService({
        companyId,
        module: "USERS",
        entity: "User",
        format,
        filters: {
          busca: search,
          cargos: ["Suporte", "Financeiro"],
          ativo: true,
          criadoDe: new Date("2026-09-01T03:00:00.000Z"),
          semValor: [],
        },
      });

      return reply.type("text/csv").send(file);
    });
  });

  await app.ready();

  return app;
}

describe("trilha de auditoria: exportação", () => {
  let app: App;

  beforeAll(async () => {
    app = await createAppWithExportRoute();
  });

  afterAll(async () => {
    await app.close();
  });

  it("grava `export` com autor, metadados, formato e filtros em chaves pt-BR, e a frase da exportação", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "GET",
      url: `${EXPORT_URL}?search=ana&format=XLSX`,
      cookies: sessionCookiesFor(admin.id),
      headers: { "user-agent": "vitest-agent" },
    });

    expect(response.statusCode).toBe(200);
    expect(await findAuditLogs(admin.companyId)).toEqual([
      expect.objectContaining({
        companyId: admin.companyId,
        module: "USERS",
        entity: "User",
        entityId: null,
        action: "export",
        description: "Exportou a lista de usuários em XLSX.",
        before: null,
        after: {
          formato: "XLSX",
          busca: "ana",
          cargos: "Suporte, Financeiro",
          ativo: true,
          criadoDe: "2026-09-01T03:00:00.000Z",
        },
        changedFields: [],
        userId: admin.id,
        requestId: expect.any(String),
        ip: "127.0.0.1",
        userAgent: "vitest-agent",
      }),
    ]);
  });

  it("filtro não aplicado (ausente ou lista vazia) não entra no depois", async () => {
    const admin = await createUser();

    await app.inject({ method: "GET", url: EXPORT_URL, cookies: sessionCookiesFor(admin.id) });

    const [log] = await findAuditLogs(admin.companyId);

    expect(log?.description).toBe("Exportou a lista de usuários em CSV.");
    expect(log?.after).not.toHaveProperty("busca");
    expect(log?.after).not.toHaveProperty("semValor");
  });

  it("aparece na trilha filtrada pela ação `export`", async () => {
    const admin = await createUser();

    await app.inject({ method: "GET", url: EXPORT_URL, cookies: sessionCookiesFor(admin.id) });
    const response = await app.inject({
      method: "GET",
      url: "/api/client/audit-logs?action=export",
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      logs: [
        expect.objectContaining({
          action: "export",
          entity: "User",
          description: "Exportou a lista de usuários em CSV.",
          userId: admin.id,
        }),
      ],
      count: 1,
    });
  });

  it("pelo `tx` de uma transação que falha, não grava", async () => {
    const company = await createCompany();

    await expect(
      prisma.$transaction(async (tx) => {
        await recordExportAuditService(
          { companyId: company.id, module: "SECURITY", entity: "Role", format: "CSV", filters: {} },
          tx,
        );

        throw new Error("falha depois do registro");
      }),
    ).rejects.toThrow("falha depois do registro");

    expect(await findAuditLogs(company.id)).toEqual([]);
  });
});

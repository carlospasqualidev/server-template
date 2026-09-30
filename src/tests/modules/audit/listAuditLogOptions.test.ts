import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { AuditAction, AuditModule } from "@/generated/prisma/client";
import { PERMISSION_DENIED_MESSAGE } from "@/hooks/requirePermission";
import { AUDIT_ENTITIES } from "@/modules/audit/audit.catalog";
import { PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const OPTIONS_URL = "/api/client/audit-logs/options";

describe("GET /api/client/audit-logs/options", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("devolve módulos, ações e entidades com o rótulo pt-BR", async () => {
    const user = await createUser({ permissions: ["backoffice.audit.read"] });

    const response = await app.inject({ method: "GET", url: OPTIONS_URL, cookies: sessionCookiesFor(user.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      modules: [
        { value: "USERS", label: "Usuários" },
        { value: "SECURITY", label: "Segurança" },
        { value: "SETTINGS", label: "Configurações" },
      ],
      actions: [
        { value: "create", label: "Criação" },
        { value: "update", label: "Edição" },
        { value: "delete", label: "Exclusão" },
        { value: "statusChange", label: "Mudança de status" },
        { value: "login", label: "Login" },
        { value: "export", label: "Exportação" },
      ],
      entities: [
        { value: "User", label: "Usuário" },
        { value: "Role", label: "Cargo" },
        { value: "SystemConfig", label: "Configuração do sistema" },
      ],
    });
  });

  it("todo valor gravável tem rótulo", async () => {
    const user = await createUser({ permissions: ["backoffice.audit.read"] });

    const body = (await app.inject({ method: "GET", url: OPTIONS_URL, cookies: sessionCookiesFor(user.id) })).json();
    const values = (options: { value: string }[]) => options.map((option) => option.value).toSorted();

    expect(values(body.modules)).toEqual(Object.values(AuditModule).toSorted());
    expect(values(body.actions)).toEqual(Object.values(AuditAction).toSorted());
    expect(values(body.entities)).toEqual([...AUDIT_ENTITIES].toSorted());
  });

  it("sem sessão responde 401 e sem `backoffice.audit.read` responde 403", async () => {
    const user = await createUser({
      permissions: PERMISSION_NAMES.filter((name) => name !== "backoffice.audit.read"),
    });

    const withoutSession = await app.inject({ method: "GET", url: OPTIONS_URL });
    const withoutPermission = await app.inject({
      method: "GET",
      url: OPTIONS_URL,
      cookies: sessionCookiesFor(user.id),
    });

    expect(withoutSession.statusCode).toBe(401);
    expect(withoutPermission.statusCode).toBe(403);
    expect(withoutPermission.json()).toEqual({ message: PERMISSION_DENIED_MESSAGE });
  });
});

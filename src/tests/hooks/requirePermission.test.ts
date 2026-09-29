import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App, buildApp } from "@/app";
import { PERMISSION_DENIED_MESSAGE, requireAnyPermission, requirePermission } from "@/hooks/requirePermission";
import { requireSession } from "@/hooks/requireSession";
import { createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

describe("requirePermission e requireAnyPermission", () => {
  let app: App;

  beforeAll(async () => {
    app = buildApp();
    app.register(async (protectedRoutes) => {
      protectedRoutes.addHook("onRequest", requireSession);
      protectedRoutes.get("/probe/one", { preHandler: requirePermission("backoffice.audit.read") }, async () => ({
        ok: true,
      }));
      protectedRoutes.get(
        "/probe/any",
        { preHandler: requireAnyPermission(["backoffice.audit.read", "backoffice.systemConfigs.read"]) },
        async () => ({ ok: true }),
      );
      protectedRoutes.get(
        "/probe/both",
        { preHandler: [requirePermission("backoffice.roles.update"), requirePermission("backoffice.users.update")] },
        async () => ({ ok: true }),
      );
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requirePermission: 403 sem a permissão, 200 com ela", async () => {
    const without = await createUser({ permissions: ["backoffice.systemConfigs.read"] });
    const withIt = await createUser({ permissions: ["backoffice.audit.read"] });

    const denied = await app.inject({ method: "GET", url: "/probe/one", cookies: sessionCookiesFor(without.id) });
    const allowed = await app.inject({ method: "GET", url: "/probe/one", cookies: sessionCookiesFor(withIt.id) });

    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ message: PERMISSION_DENIED_MESSAGE });
    expect(allowed.statusCode).toBe(200);
  });

  it("requireAnyPermission: basta uma das permissões", async () => {
    const onlySecond = await createUser({ permissions: ["backoffice.systemConfigs.read"] });
    const none = await createUser({ permissions: ["backoffice.users.read"] });

    const allowed = await app.inject({ method: "GET", url: "/probe/any", cookies: sessionCookiesFor(onlySecond.id) });
    const denied = await app.inject({ method: "GET", url: "/probe/any", cookies: sessionCookiesFor(none.id) });

    expect(allowed.statusCode).toBe(200);
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ message: PERMISSION_DENIED_MESSAGE });
  });

  it("lista de preHandlers exige todas as permissões", async () => {
    const onlyOne = await createUser({ permissions: ["backoffice.roles.update"] });
    const both = await createUser({ permissions: ["backoffice.roles.update", "backoffice.users.update"] });

    const denied = await app.inject({ method: "GET", url: "/probe/both", cookies: sessionCookiesFor(onlyOne.id) });
    const allowed = await app.inject({ method: "GET", url: "/probe/both", cookies: sessionCookiesFor(both.id) });

    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
  });

  it("sem sessão responde 401 antes da checagem", async () => {
    const response = await app.inject({ method: "GET", url: "/probe/one" });

    expect(response.statusCode).toBe(401);
  });
});

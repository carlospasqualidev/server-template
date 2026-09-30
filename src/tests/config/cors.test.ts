import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { createTestApp } from "@/tests/helpers/app";

const ALLOWED_ORIGIN = "http://localhost:5173";

describe("CORS (preflight)", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // Rotas reais de cada método de escrita; o preflight responde no hook, antes da sessão, então vai sem cookie.
  it.each([
    { method: "PATCH", url: "/api/client/users/me" },
    { method: "PUT", url: "/api/client/users/me/password" },
    { method: "DELETE", url: "/api/client/users/00000000-0000-0000-0000-000000000000" },
  ])("libera $method para origem permitida, com credenciais", async ({ method, url }) => {
    const response = await app.inject({
      method: "OPTIONS",
      url,
      headers: { origin: ALLOWED_ORIGIN, "access-control-request-method": method },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(String(response.headers["access-control-allow-methods"]).split(", ")).toContain(method);
  });

  it("origem fora da allowlist não recebe `Access-Control-Allow-Origin`", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/client/users/me",
      headers: { origin: "https://evil.example.com", "access-control-request-method": "PATCH" },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

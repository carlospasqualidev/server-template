import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";
import { bearerHeadersFor, sessionCookiesFor } from "@/tests/helpers/session";

describe("POST /api/client/session/logout", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("limpa o cookie de sessão", async () => {
    const user = await createUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/client/session/logout",
      cookies: sessionCookiesFor(user.id),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });

    const cookie = response.cookies.find((item) => item.name === "token");
    expect(cookie?.value).toBe("");
    expect(cookie?.expires?.getTime()).toBeLessThan(Date.now());
  });

  it("com Bearer responde { success } e não revoga o token: o app é quem o descarta", async () => {
    const user = await createUser();
    const headers = bearerHeadersFor(user.id);

    const response = await app.inject({ method: "POST", url: "/api/client/session/logout", headers });
    // JWT sem estado: o mesmo token continua valendo até expirar, por isso o app o apaga do armazenamento seguro.
    const me = await app.inject({ method: "GET", url: "/api/client/users/me", headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(me.statusCode).toBe(200);
  });
});

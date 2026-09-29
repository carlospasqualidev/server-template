import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

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
});

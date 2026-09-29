import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";

describe("GET /api/client/users/:userId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("devolve um usuário da mesma empresa", async () => {
    const admin = await createUser();
    const colleague = await createUser({ companyId: admin.companyId, name: "Colega", phone: "(48) 99999-9999" });

    const response = await app.inject({
      method: "GET",
      url: `${USERS_URL}/${colleague.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ id: colleague.id, name: "Colega", phone: "(48) 99999-9999" });
  });

  it("usuário de outra empresa responde 404 (não 403)", async () => {
    const admin = await createUser();
    const outsider = await createUser();

    const response = await app.inject({
      method: "GET",
      url: `${USERS_URL}/${outsider.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Usuário não existe na base de dados." });
  });

  it("id fora do formato uuid responde 400", async () => {
    const admin = await createUser();

    const response = await app.inject({ method: "GET", url: `${USERS_URL}/123`, cookies: sessionCookiesFor(admin.id) });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([{ path: "userId", message: "Identificador inválido." }]);
  });
});

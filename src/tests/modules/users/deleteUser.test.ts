import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";

describe("DELETE /api/client/users/:userId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exclui logicamente: marca deletedAt, bloqueia e some da listagem", async () => {
    const admin = await createUser();
    const target = await createUser({ companyId: admin.companyId });
    const cookies = sessionCookiesFor(admin.id);

    const response = await app.inject({ method: "DELETE", url: `${USERS_URL}/${target.id}`, cookies });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: "Usuário excluído." });

    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(deleted.isActive).toBe(false);

    const afterDelete = await app.inject({ method: "GET", url: `${USERS_URL}/${target.id}`, cookies });
    expect(afterDelete.statusCode).toBe(404);
  });

  it("não permite excluir o próprio usuário", async () => {
    const admin = await createUser();

    const response = await app.inject({
      method: "DELETE",
      url: `${USERS_URL}/${admin.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Você não pode excluir o próprio usuário." });
  });

  it("usuário de outra empresa responde 404", async () => {
    const admin = await createUser();
    const outsider = await createUser();

    const response = await app.inject({
      method: "DELETE",
      url: `${USERS_URL}/${outsider.id}`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(404);
  });
});

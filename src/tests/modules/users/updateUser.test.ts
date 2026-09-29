import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";

describe("PATCH /api/client/users/:userId", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("atualiza só os campos enviados", async () => {
    const admin = await createUser();
    const target = await createUser({ companyId: admin.companyId, name: "Antes", phone: "48999999999" });

    const response = await app.inject({
      method: "PATCH",
      url: `${USERS_URL}/${target.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Depois", isActive: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "Usuário atualizado.",
      user: expect.objectContaining({ id: target.id, name: "Depois", phone: "48999999999", isActive: false }),
    });
  });

  it("troca a senha quando password e confirmPassword batem", async () => {
    const admin = await createUser();
    const target = await createUser({ companyId: admin.companyId });

    const response = await app.inject({
      method: "PATCH",
      url: `${USERS_URL}/${target.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { password: "nova-senha-1", confirmPassword: "nova-senha-1" },
    });

    expect(response.statusCode).toBe(200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword("nova-senha-1", updated.password)).toBe(true);
  });

  it("null limpa telefone e imagem", async () => {
    const admin = await createUser();
    const target = await createUser({
      companyId: admin.companyId,
      phone: "48999999999",
      image: "https://cdn.example.com/a.png",
    });

    const response = await app.inject({
      method: "PATCH",
      url: `${USERS_URL}/${target.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { phone: null, image: null },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ phone: null, image: null });
  });

  it("usuário de outra empresa responde 404", async () => {
    const admin = await createUser();
    const outsider = await createUser();

    const response = await app.inject({
      method: "PATCH",
      url: `${USERS_URL}/${outsider.id}`,
      cookies: sessionCookiesFor(admin.id),
      payload: { name: "Hack" },
    });

    expect(response.statusCode).toBe(404);
  });
});

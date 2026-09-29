import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createUser } from "@/tests/helpers/factories";

const REGISTER_URL = "/api/client/session/register";

describe("POST /api/client/session/register", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("cria empresa e usuário, inicia a sessão e responde 201", async () => {
    const response = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload: { name: "Carla", email: "carla@example.com", password: "senha-forte-1" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      success: true,
      user: { id: expect.any(String), name: "Carla", email: "carla@example.com", image: null },
    });
    expect(response.cookies.find((cookie) => cookie.name === "token")?.value).toBeTruthy();

    const created = await prisma.user.findUnique({ where: { email: "carla@example.com" }, include: { company: true } });
    expect(created?.company.name).toBe("Empresa de Carla");
    expect(created?.password).not.toBe("senha-forte-1");
  });

  it("e-mail já cadastrado responde 409", async () => {
    await createUser({ email: "dup@example.com" });

    const response = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload: { name: "Outra", email: "dup@example.com", password: "senha-forte-1" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "E-mail já cadastrado." });
  });

  it("senha curta responde 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload: { name: "Curta", email: "curta@example.com", password: "123" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([
      { path: "password", message: "A senha precisa ter pelo menos 8 caracteres." },
    ]);
  });
});

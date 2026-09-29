import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { createTestApp } from "@/tests/helpers/app";
import { createCompany, createUser } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const USERS_URL = "/api/client/users";

describe("GET /api/client/users", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedCompanyWithUsers() {
    const company = await createCompany();
    const admin = await createUser({ companyId: company.id, name: "Admin", email: "admin@example.com" });
    await createUser({ companyId: company.id, name: "Bruno", email: "bruno@example.com" });
    await createUser({ companyId: company.id, name: "Carla", email: "carla@example.com", isActive: false });
    await createUser({ companyId: company.id, name: "Excluída", email: "excluida@example.com", deletedAt: new Date() });

    return { company, admin };
  }

  it("lista só usuários ativos e excluídos logicamente ficam de fora, ordenados por nome", async () => {
    const { admin } = await seedCompanyWithUsers();

    const response = await app.inject({ method: "GET", url: USERS_URL, cookies: sessionCookiesFor(admin.id) });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.count).toBe(3);
    expect(body.users.map((user: { name: string }) => user.name)).toEqual(["Admin", "Bruno", "Carla"]);
    expect(body.users[0]).toEqual({
      id: admin.id,
      name: "Admin",
      email: "admin@example.com",
      image: null,
      phone: null,
      isActive: true,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(body.users[0]).not.toHaveProperty("password");
  });

  it("não enxerga usuários de outra empresa", async () => {
    const { admin } = await seedCompanyWithUsers();
    await createUser({ name: "Intruso", email: "intruso@example.com" });

    const response = await app.inject({ method: "GET", url: USERS_URL, cookies: sessionCookiesFor(admin.id) });

    expect(response.json().count).toBe(3);
    expect(response.json().users.map((user: { name: string }) => user.name)).not.toContain("Intruso");
  });

  it("pagina 0-based, ordena e filtra por busca e status", async () => {
    const { admin } = await seedCompanyWithUsers();
    const cookies = sessionCookiesFor(admin.id);

    const page = await app.inject({ method: "GET", url: `${USERS_URL}?page=1&pageSize=2`, cookies });
    expect(page.json().count).toBe(3);
    expect(page.json().users.map((user: { name: string }) => user.name)).toEqual(["Carla"]);

    const sorted = await app.inject({ method: "GET", url: `${USERS_URL}?orderBy=email&order=desc`, cookies });
    expect(sorted.json().users.map((user: { email: string }) => user.email)).toEqual([
      "carla@example.com",
      "bruno@example.com",
      "admin@example.com",
    ]);

    const searched = await app.inject({ method: "GET", url: `${USERS_URL}?search=BRU`, cookies });
    expect(searched.json().users.map((user: { name: string }) => user.name)).toEqual(["Bruno"]);

    const blocked = await app.inject({ method: "GET", url: `${USERS_URL}?isActive=false`, cookies });
    expect(blocked.json().users.map((user: { name: string }) => user.name)).toEqual(["Carla"]);
  });

  it("campo de ordenação fora da allowlist responde 400", async () => {
    const { admin } = await seedCompanyWithUsers();

    const response = await app.inject({
      method: "GET",
      url: `${USERS_URL}?orderBy=password`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0].path).toBe("orderBy");
  });

  it("pageSize acima do máximo responde 400", async () => {
    const { admin } = await seedCompanyWithUsers();

    const response = await app.inject({
      method: "GET",
      url: `${USERS_URL}?pageSize=500`,
      cookies: sessionCookiesFor(admin.id),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0].path).toBe("pageSize");
  });
});

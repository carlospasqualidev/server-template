import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { createTestApp } from "@/tests/helpers/app";
import { createCompany, createRole, createUser, findAdminRole } from "@/tests/helpers/factories";
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
    const { company, admin } = await seedCompanyWithUsers();
    const adminRole = await findAdminRole(company.id);

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
      idleTimeoutMinutes: null,
      lastLoginAt: null,
      roles: [{ id: adminRole.id, name: "Administrador" }],
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

  it("traz os cargos que valem (não excluídos, da mesma empresa, por nome) e o último acesso", async () => {
    const company = await createCompany();
    const admin = await createUser({ companyId: company.id, name: "Admin" });
    const support = await createRole({ companyId: company.id, name: "Suporte" });
    const finance = await createRole({ companyId: company.id, name: "Financeiro" });
    const removed = await createRole({ companyId: company.id, name: "Antigo", deletedAt: new Date() });
    const foreign = await createRole({ name: "Externo" });
    const bruno = await createUser({
      companyId: company.id,
      name: "Bruno",
      roleIds: [support.id, finance.id, removed.id],
      lastLoginAt: new Date("2026-09-20T13:45:00.000Z"),
    });
    // Vínculo cruzado gravado por fora: a aplicação nunca o cria, e a lista não o mostra.
    await prisma.userRole.create({ data: { userId: bruno.id, roleId: foreign.id } });
    await createUser({ companyId: company.id, name: "Carla", permissions: [] });

    const response = await app.inject({ method: "GET", url: USERS_URL, cookies: sessionCookiesFor(admin.id) });
    const users = response.json().users as { name: string; roles: unknown; lastLoginAt: unknown }[];

    expect(response.statusCode).toBe(200);
    expect(users.map(({ name, roles, lastLoginAt }) => ({ name, roles, lastLoginAt }))).toEqual([
      {
        name: "Admin",
        roles: [{ id: (await findAdminRole(company.id)).id, name: "Administrador" }],
        lastLoginAt: null,
      },
      {
        name: "Bruno",
        roles: [
          { id: finance.id, name: "Financeiro" },
          { id: support.id, name: "Suporte" },
        ],
        lastLoginAt: "2026-09-20T13:45:00.000Z",
      },
      { name: "Carla", roles: [], lastLoginAt: null },
    ]);
  });

  describe("filtro por cargo", () => {
    async function seedUsersWithRoles() {
      const company = await createCompany();
      const admin = await createUser({ companyId: company.id, name: "Admin" });
      const support = await createRole({ companyId: company.id, name: "Suporte" });
      const finance = await createRole({ companyId: company.id, name: "Financeiro" });
      const audit = await createRole({ companyId: company.id, name: "Auditoria" });
      await createUser({ companyId: company.id, name: "Bruno", roleIds: [support.id] });
      await createUser({ companyId: company.id, name: "Carla", roleIds: [finance.id] });
      await createUser({ companyId: company.id, name: "Daniel", roleIds: [support.id, finance.id] });
      await createUser({ companyId: company.id, name: "Elisa", roleIds: [audit.id] });
      await createUser({ companyId: company.id, name: "Fábio", permissions: [] });
      await createUser({ companyId: company.id, name: "Excluído", roleIds: [support.id], deletedAt: new Date() });

      return { company, admin, support, finance, audit };
    }

    it("traz quem tem qualquer um dos cargos (por vírgula), uma vez só, e deixa os outros de fora", async () => {
      const { admin, support, finance } = await seedUsersWithRoles();

      const response = await app.inject({
        method: "GET",
        url: `${USERS_URL}?roleId=${support.id},${finance.id}`,
        cookies: sessionCookiesFor(admin.id),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().count).toBe(3);
      expect(response.json().users.map((user: { name: string }) => user.name)).toEqual(["Bruno", "Carla", "Daniel"]);
    });

    it("um cargo só, combinado com os outros filtros", async () => {
      const { admin, support } = await seedUsersWithRoles();
      const cookies = sessionCookiesFor(admin.id);

      const bySupport = await app.inject({ method: "GET", url: `${USERS_URL}?roleId=${support.id}`, cookies });
      const withSearch = await app.inject({
        method: "GET",
        url: `${USERS_URL}?roleId=${support.id}&search=dan`,
        cookies,
      });

      expect(bySupport.json().users.map((user: { name: string }) => user.name)).toEqual(["Bruno", "Daniel"]);
      expect(withSearch.json()).toMatchObject({ count: 1, users: [{ name: "Daniel" }] });
    });

    it("cargo de outra empresa no filtro não traz ninguém, nem quem tem vínculo cruzado gravado por fora", async () => {
      const { company, admin } = await seedUsersWithRoles();
      const foreign = await createRole({ name: "Externo" });
      await createUser({ companyId: foreign.companyId, name: "De fora", roleIds: [foreign.id] });
      const linked = await createUser({ companyId: company.id, name: "Vinculado", permissions: [] });
      await prisma.userRole.create({ data: { userId: linked.id, roleId: foreign.id } });

      const response = await app.inject({
        method: "GET",
        url: `${USERS_URL}?roleId=${foreign.id}`,
        cookies: sessionCookiesFor(admin.id),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ users: [], count: 0 });
    });

    it("cargo excluído no filtro não traz ninguém", async () => {
      const { company, admin } = await seedUsersWithRoles();
      const removed = await createRole({ companyId: company.id, name: "Antigo", deletedAt: new Date() });
      await createUser({ companyId: company.id, name: "Vinculado", roleIds: [removed.id] });

      const response = await app.inject({
        method: "GET",
        url: `${USERS_URL}?roleId=${removed.id}`,
        cookies: sessionCookiesFor(admin.id),
      });

      expect(response.json()).toEqual({ users: [], count: 0 });
    });

    it("id de cargo fora do formato uuid responde 400", async () => {
      const { admin, support } = await seedUsersWithRoles();

      const response = await app.inject({
        method: "GET",
        url: `${USERS_URL}?roleId=${support.id},abc`,
        cookies: sessionCookiesFor(admin.id),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().issues).toEqual([{ path: "roleId.1", message: "Identificador inválido." }]);
    });
  });

  describe("filtro por período de cadastro", () => {
    async function seedUsersByCreatedAt() {
      const company = await createCompany();
      const admin = await createUser({
        companyId: company.id,
        name: "Admin",
        createdAt: new Date("2026-01-10T12:00:00.000Z"),
      });
      const seeds = [
        { name: "Agosto", createdAt: "2026-08-31T23:59:59.999Z" },
        { name: "Início", createdAt: "2026-09-01T00:00:00.000Z" },
        { name: "Meio", createdAt: "2026-09-15T10:30:00.000Z" },
        { name: "Fim", createdAt: "2026-09-30T23:59:59.999Z" },
        { name: "Outubro", createdAt: "2026-10-01T00:00:00.000Z" },
      ];

      for (const { name, createdAt } of seeds) {
        await createUser({ companyId: company.id, name, createdAt: new Date(createdAt) });
      }

      await createUser({
        companyId: company.id,
        name: "Excluído",
        createdAt: new Date("2026-09-10T00:00:00.000Z"),
        deletedAt: new Date(),
      });
      // De outra empresa, cadastrado no período: nunca aparece.
      await createUser({ name: "Intruso", createdAt: new Date("2026-09-10T00:00:00.000Z") });

      return { admin };
    }

    async function listNames(cookies: Record<string, string>, filter: string) {
      const response = await app.inject({
        method: "GET",
        url: `${USERS_URL}?orderBy=createdAt&order=asc&${filter}`,
        cookies,
      });

      expect(response.statusCode).toBe(200);

      return {
        count: response.json().count as number,
        names: response.json().users.map((user: { name: string }) => user.name) as string[],
      };
    }

    it("inclui as duas bordas e deixa de fora quem foi cadastrado antes ou depois", async () => {
      const { admin } = await seedUsersByCreatedAt();

      expect(
        await listNames(
          sessionCookiesFor(admin.id),
          "createdFrom=2026-09-01T00:00:00.000Z&createdTo=2026-09-30T23:59:59.999Z",
        ),
      ).toEqual({ count: 3, names: ["Início", "Meio", "Fim"] });
    });

    it("cada ponta sozinha também filtra, e o total acompanha o filtro", async () => {
      const { admin } = await seedUsersByCreatedAt();
      const cookies = sessionCookiesFor(admin.id);

      expect(await listNames(cookies, "createdFrom=2026-09-15T10:30:00.000Z")).toEqual({
        count: 3,
        names: ["Meio", "Fim", "Outubro"],
      });
      expect(await listNames(cookies, "createdTo=2026-09-01T00:00:00.000Z")).toEqual({
        count: 3,
        names: ["Admin", "Agosto", "Início"],
      });
      expect(await listNames(cookies, "createdFrom=2026-09-01T00:00:00.000Z&pageSize=1")).toEqual({
        count: 4,
        names: ["Início"],
      });
    });

    it("combina com os outros filtros", async () => {
      const { admin } = await seedUsersByCreatedAt();

      expect(
        await listNames(
          sessionCookiesFor(admin.id),
          "createdFrom=2026-09-01T00:00:00.000Z&createdTo=2026-09-30T23:59:59.999Z&search=mei",
        ),
      ).toEqual({ count: 1, names: ["Meio"] });
    });

    it("data fora do ISO 8601 UTC responde 400", async () => {
      const { admin } = await seedUsersByCreatedAt();

      const response = await app.inject({
        method: "GET",
        url: `${USERS_URL}?createdFrom=2026-09-01`,
        cookies: sessionCookiesFor(admin.id),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().issues).toEqual([
        { path: "createdFrom", message: "Data e hora inválidas. Use ISO 8601 em UTC." },
      ]);
    });
  });

  it("ordena por último acesso com quem nunca acessou no fim, nos dois sentidos", async () => {
    const company = await createCompany();
    const admin = await createUser({ companyId: company.id, name: "Admin" });
    await createUser({ companyId: company.id, name: "Antigo", lastLoginAt: new Date("2026-09-01T10:00:00.000Z") });
    await createUser({ companyId: company.id, name: "Recente", lastLoginAt: new Date("2026-09-28T10:00:00.000Z") });
    await createUser({ companyId: company.id, name: "Nunca", lastLoginAt: null });
    const cookies = sessionCookiesFor(admin.id);

    const ascending = await app.inject({ method: "GET", url: `${USERS_URL}?orderBy=lastLoginAt&order=asc`, cookies });
    const descending = await app.inject({ method: "GET", url: `${USERS_URL}?orderBy=lastLoginAt&order=desc`, cookies });
    const namesOf = (response: typeof ascending) =>
      response.json().users.map((user: { name: string }) => user.name) as string[];

    expect(ascending.statusCode).toBe(200);
    expect(namesOf(ascending).slice(0, 2)).toEqual(["Antigo", "Recente"]);
    expect(namesOf(ascending).slice(2).toSorted()).toEqual(["Admin", "Nunca"]);
    expect(descending.statusCode).toBe(200);
    expect(namesOf(descending).slice(0, 2)).toEqual(["Recente", "Antigo"]);
    expect(namesOf(descending).slice(2).toSorted()).toEqual(["Admin", "Nunca"]);

    const lastPage = await app.inject({
      method: "GET",
      url: `${USERS_URL}?orderBy=lastLoginAt&order=desc&page=1&pageSize=2`,
      cookies,
    });

    expect(lastPage.json().count).toBe(4);
    expect(lastPage.json().users.map((user: { lastLoginAt: unknown }) => user.lastLoginAt)).toEqual([null, null]);
  });

  it("desempata por id entre quem nunca acessou, nos dois sentidos, e página de 1 não repete nem pula ninguém", async () => {
    const company = await createCompany();
    const admin = await createUser({ companyId: company.id, name: "Admin" });
    const older = await createUser({
      companyId: company.id,
      name: "Antigo",
      lastLoginAt: new Date("2026-09-01T10:00:00Z"),
    });
    const newer = await createUser({
      companyId: company.id,
      name: "Recente",
      lastLoginAt: new Date("2026-09-28T10:00:00Z"),
    });
    // Criados em sequência, com nomes fora da ordem de criação: a ordem entre os nulos só pode vir do id.
    const zeca = await createUser({ companyId: company.id, name: "Zeca", lastLoginAt: null });
    const bia = await createUser({ companyId: company.id, name: "Bia", lastLoginAt: null });
    const mario = await createUser({ companyId: company.id, name: "Mário", lastLoginAt: null });
    const neverIds = [admin, zeca, bia, mario].map((user) => user.id).toSorted();
    const cookies = sessionCookiesFor(admin.id);

    async function listIds(order: "asc" | "desc", page?: number) {
      const pagination = page === undefined ? "" : `&page=${page}&pageSize=1`;
      const response = await app.inject({
        method: "GET",
        url: `${USERS_URL}?orderBy=lastLoginAt&order=${order}${pagination}`,
        cookies,
      });

      return response.json().users.map((user: { id: string }) => user.id) as string[];
    }

    const cases = [
      { order: "asc", expected: [older.id, newer.id, ...neverIds] },
      { order: "desc", expected: [newer.id, older.id, ...neverIds.toReversed()] },
    ] as const;

    for (const { order, expected } of cases) {
      expect(await listIds(order)).toEqual(expected);

      const pages: string[][] = [];
      for (let page = 0; page <= expected.length; page += 1) {
        pages.push(await listIds(order, page));
      }

      // Uma página por usuário, na mesma ordem da lista inteira, e a página seguinte à última vem vazia.
      expect(pages).toEqual([...expected.map((id) => [id]), []]);
    }
  });

  it("ordena por status, bloqueados antes no asc e ativos antes no desc, com desempate por id nos dois sentidos", async () => {
    const company = await createCompany();
    const admin = await createUser({ companyId: company.id, name: "Admin" });
    // Nomes fora da ordem de criação: dentro do mesmo status, a ordem só pode vir do id.
    const zeca = await createUser({ companyId: company.id, name: "Zeca", isActive: false });
    const bia = await createUser({ companyId: company.id, name: "Bia" });
    const ana = await createUser({ companyId: company.id, name: "Ana", isActive: false });
    const blockedIds = [zeca, ana].map((user) => user.id).toSorted();
    const activeIds = [admin, bia].map((user) => user.id).toSorted();
    const cookies = sessionCookiesFor(admin.id);

    const cases = [
      { order: "asc", expected: [...blockedIds, ...activeIds], statuses: [false, false, true, true] },
      {
        order: "desc",
        expected: [...activeIds.toReversed(), ...blockedIds.toReversed()],
        statuses: [true, true, false, false],
      },
    ] as const;

    for (const { order, expected, statuses } of cases) {
      const response = await app.inject({
        method: "GET",
        url: `${USERS_URL}?orderBy=isActive&order=${order}`,
        cookies,
      });
      const users = response.json().users as { id: string; isActive: boolean }[];

      expect(response.statusCode).toBe(200);
      expect(users.map((user) => user.id)).toEqual(expected);
      expect(users.map((user) => user.isActive)).toEqual(statuses);

      const secondPage = await app.inject({
        method: "GET",
        url: `${USERS_URL}?orderBy=isActive&order=${order}&page=1&pageSize=2`,
        cookies,
      });

      expect(secondPage.json().count).toBe(4);
      expect(secondPage.json().users.map((user: { id: string }) => user.id)).toEqual(expected.slice(2));
    }
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

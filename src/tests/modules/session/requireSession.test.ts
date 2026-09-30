import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { env } from "@/config/env";
import { signSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { withFrozenDate } from "@/tests/helpers/clock";
import { createCompany, createRole, createUser } from "@/tests/helpers/factories";
import { bearerHeadersFor, sessionCookiesFor } from "@/tests/helpers/session";

const ME_URL = "/api/client/users/me";
const USERS_URL = "/api/client/users";

describe("rotas protegidas (hook requireSession)", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sem cookie responde 401", async () => {
    const response = await app.inject({ method: "GET", url: ME_URL });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Sessão não informada." });
  });

  it("token inválido responde 401", async () => {
    const response = await app.inject({ method: "GET", url: ME_URL, cookies: { token: "nao-e-um-jwt" } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Sessão inválida ou expirada." });
  });

  it("usuário bloqueado depois do login responde 403", async () => {
    const user = await createUser({ isActive: false });

    const response = await app.inject({ method: "GET", url: ME_URL, cookies: sessionCookiesFor(user.id) });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "Conta bloqueada." });
  });

  it("usuário excluído depois do login responde 401", async () => {
    const user = await createUser({ deletedAt: new Date() });

    const response = await app.inject({ method: "GET", url: ME_URL, cookies: sessionCookiesFor(user.id) });

    expect(response.statusCode).toBe(401);
  });

  it("sessão válida devolve o usuário em /me, com as permissões do cargo Administrador", async () => {
    const user = await createUser({ name: "Ativo", email: "ativo@example.com" });

    const response = await app.inject({ method: "GET", url: ME_URL, cookies: sessionCookiesFor(user.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: user.id,
        name: "Ativo",
        email: "ativo@example.com",
        image: null,
        permissions: [...PERMISSION_NAMES].toSorted(),
        idleTimeoutMinutes: 20,
      },
    });
  });

  it("usuário sem cargo tem sessão válida e permissions vazio", async () => {
    const user = await createUser({ permissions: [] });

    const response = await app.inject({ method: "GET", url: ME_URL, cookies: sessionCookiesFor(user.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.permissions).toEqual([]);
  });

  it("permissões efetivas são a união dos cargos, sem repetição, ignorando cargo excluído", async () => {
    const company = await createCompany();
    const readers = await createRole({
      companyId: company.id,
      permissions: ["backoffice.users.read", "backoffice.roles.read"],
    });
    const editors = await createRole({
      companyId: company.id,
      permissions: ["backoffice.users.read", "backoffice.users.update"],
    });
    const deleted = await createRole({
      companyId: company.id,
      permissions: ["backoffice.users.delete"],
      deletedAt: new Date(),
    });
    const user = await createUser({ companyId: company.id, roleIds: [readers.id, editors.id, deleted.id] });

    const response = await app.inject({ method: "GET", url: ME_URL, cookies: sessionCookiesFor(user.id) });

    expect(response.json().user.permissions).toEqual([
      "backoffice.roles.read",
      "backoffice.users.read",
      "backoffice.users.update",
    ]);
  });

  it("vínculo com cargo de outra empresa, gravado direto no banco, não concede permissão", async () => {
    const user = await createUser({ permissions: ["backoffice.users.read"] });
    const foreignRole = await createRole({ permissions: ["backoffice.users.delete", "backoffice.roles.read"] });
    await prisma.userRole.create({ data: { userId: user.id, roleId: foreignRole.id } });
    const cookies = sessionCookiesFor(user.id);

    const me = await app.inject({ method: "GET", url: ME_URL, cookies });
    const deletion = await app.inject({ method: "DELETE", url: `${USERS_URL}/${user.id}`, cookies });

    expect(foreignRole.companyId).not.toBe(user.companyId);
    expect(me.json().user.permissions).toEqual(["backoffice.users.read"]);
    expect(deletion.statusCode).toBe(403);
  });

  it("mudança de cargo vale na próxima requisição, sem novo login", async () => {
    const user = await createUser({ permissions: ["backoffice.users.read"] });
    const cookies = sessionCookiesFor(user.id);

    const before = await app.inject({ method: "GET", url: USERS_URL, cookies });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    const after = await app.inject({ method: "GET", url: USERS_URL, cookies });

    expect(before.statusCode).toBe(200);
    expect(after.statusCode).toBe(403);
  });
});

describe("rotas protegidas com Authorization: Bearer (app nativo)", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("token válido no cabeçalho, sem cookie, devolve o usuário em /me", async () => {
    const user = await createUser({ name: "Nativo", email: "nativo@example.com" });

    const response = await app.inject({ method: "GET", url: ME_URL, headers: bearerHeadersFor(user.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: user.id,
        name: "Nativo",
        email: "nativo@example.com",
        image: null,
        permissions: [...PERMISSION_NAMES].toSorted(),
        idleTimeoutMinutes: 20,
      },
    });
  });

  it("o nome do esquema não diferencia maiúsculas", async () => {
    const user = await createUser();

    const response = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: { authorization: `bearer ${signSessionToken(user.id)}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.id).toBe(user.id);
  });

  it("token inválido responde 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: { authorization: "Bearer nao-e-um-jwt" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Sessão inválida ou expirada." });
  });

  it("token expirado responde 401", async () => {
    const user = await createUser();
    // Assinado com o relógio da aplicação no passado, com o TTL de sempre: venceu há um minuto.
    const issuedAt = new Date(Date.now() - (env.sessionTtlSeconds + 60) * 1000);
    const expiredToken = await withFrozenDate(issuedAt, async () => signSessionToken(user.id));

    const response = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: { authorization: `Bearer ${expiredToken}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Sessão inválida ou expirada." });
  });

  it("Bearer sem credencial responde 401 sem cair no cookie", async () => {
    const user = await createUser();

    const response = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: { authorization: "Bearer " },
      cookies: sessionCookiesFor(user.id),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Sessão não informada." });
  });

  it("usuário bloqueado depois do login responde 403", async () => {
    const user = await createUser({ isActive: false });

    const response = await app.inject({ method: "GET", url: ME_URL, headers: bearerHeadersFor(user.id) });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "Conta bloqueada." });
  });

  it("usuário excluído depois do login responde 401", async () => {
    const user = await createUser({ deletedAt: new Date() });

    const response = await app.inject({ method: "GET", url: ME_URL, headers: bearerHeadersFor(user.id) });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Usuário não encontrado." });
  });

  it("mudança de cargo vale na próxima requisição, como no cookie", async () => {
    const user = await createUser({ permissions: ["backoffice.users.read"] });
    const headers = bearerHeadersFor(user.id);

    const before = await app.inject({ method: "GET", url: USERS_URL, headers });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    const after = await app.inject({ method: "GET", url: USERS_URL, headers });

    expect(before.statusCode).toBe(200);
    expect(after.statusCode).toBe(403);
  });

  it("com o cabeçalho e o cookie, vale o cabeçalho", async () => {
    const company = await createCompany();
    const fromHeader = await createUser({ companyId: company.id, email: "cabecalho@example.com" });
    const fromCookie = await createUser({ companyId: company.id, email: "cookie@example.com" });

    const response = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: bearerHeadersFor(fromHeader.id),
      cookies: sessionCookiesFor(fromCookie.id),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.id).toBe(fromHeader.id);
  });

  it("cabeçalho inválido com cookie válido responde 401: não cai no cookie", async () => {
    const user = await createUser();

    const response = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: { authorization: "Bearer nao-e-um-jwt" },
      cookies: sessionCookiesFor(user.id),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: "Sessão inválida ou expirada." });
  });

  it("outro esquema (Basic de um proxy) não é sessão: vale o cookie, e sem cookie responde 401", async () => {
    const user = await createUser();
    const basic = { authorization: `Basic ${Buffer.from("proxy:senha").toString("base64")}` };

    const withCookie = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: basic,
      cookies: sessionCookiesFor(user.id),
    });
    const withoutCookie = await app.inject({ method: "GET", url: ME_URL, headers: basic });

    expect(withCookie.statusCode).toBe(200);
    expect(withCookie.json().user.id).toBe(user.id);
    expect(withoutCookie.statusCode).toBe(401);
    expect(withoutCookie.json()).toEqual({ message: "Sessão não informada." });
  });
});

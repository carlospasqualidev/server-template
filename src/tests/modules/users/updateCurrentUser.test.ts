import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { prisma } from "@/lib/prisma";
import { PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";
import { createTestApp } from "@/tests/helpers/app";
import { createCompany, createSystemConfig, createUser, findAuditLogs } from "@/tests/helpers/factories";
import { sessionCookiesFor } from "@/tests/helpers/session";

const ME_URL = "/api/client/users/me";

describe("PATCH /api/client/users/me", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  function updateProfile(userId: string, payload: Record<string, unknown>) {
    return app.inject({ method: "PATCH", url: ME_URL, cookies: sessionCookiesFor(userId), payload });
  }

  it("atualiza nome, telefone, foto e tempo de inatividade e devolve o usuário no formato da sessão", async () => {
    const user = await createUser({ name: "Antes", email: "eu@example.com" });

    const response = await updateProfile(user.id, {
      name: "Depois",
      phone: "(48) 99999-9999",
      image: "https://cdn.example.com/eu.png",
      idleTimeoutMinutes: 15,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "Perfil atualizado.",
      user: {
        id: user.id,
        name: "Depois",
        email: "eu@example.com",
        image: "https://cdn.example.com/eu.png",
        permissions: [...PERMISSION_NAMES].toSorted(),
        idleTimeoutMinutes: 15,
      },
    });
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { name: true, phone: true, image: true, idleTimeoutMinutes: true },
      }),
    ).toEqual({
      name: "Depois",
      phone: "(48) 99999-9999",
      image: "https://cdn.example.com/eu.png",
      idleTimeoutMinutes: 15,
    });
  });

  it("muda só os campos enviados", async () => {
    const user = await createUser({
      name: "Rita",
      phone: "48999999999",
      image: "https://cdn.example.com/rita.png",
      idleTimeoutMinutes: 30,
    });

    const cases = [
      { payload: { name: "Rita Lima" }, expected: { name: "Rita Lima" } },
      { payload: { phone: "4833334444" }, expected: { phone: "4833334444" } },
      {
        payload: { image: "https://cdn.example.com/nova.png" },
        expected: { image: "https://cdn.example.com/nova.png" },
      },
      { payload: { idleTimeoutMinutes: 10 }, expected: { idleTimeoutMinutes: 10 } },
    ];
    let current = {
      name: "Rita",
      phone: "48999999999",
      image: "https://cdn.example.com/rita.png",
      idleTimeoutMinutes: 30,
    };

    for (const { payload, expected } of cases) {
      const response = await updateProfile(user.id, payload);
      current = { ...current, ...expected };

      expect(response.statusCode).toBe(200);
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { name: true, phone: true, image: true, idleTimeoutMinutes: true },
        }),
      ).toEqual(current);
    }
  });

  it("null limpa telefone e foto", async () => {
    const user = await createUser({ phone: "48999999999", image: "https://cdn.example.com/a.png" });

    const response = await updateProfile(user.id, { phone: null, image: null });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.image).toBeNull();
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { phone: true, image: true } }),
    ).toEqual({ phone: null, image: null });
  });

  it("tempo de inatividade null volta a herdar o da empresa, já resolvido na resposta", async () => {
    const company = await createCompany();
    await createSystemConfig({ companyId: company.id, key: "security.idleTimeoutMinutes", value: "60" });
    const user = await createUser({ companyId: company.id, idleTimeoutMinutes: 5 });

    const response = await updateProfile(user.id, { idleTimeoutMinutes: null });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.idleTimeoutMinutes).toBe(60);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { idleTimeoutMinutes: true } }),
    ).toEqual({ idleTimeoutMinutes: null });
  });

  it("não exige permissão de administrar usuários: quem não tem cargo edita o próprio perfil", async () => {
    const user = await createUser({ name: "Sem Cargo", permissions: [] });

    const response = await updateProfile(user.id, { name: "Com Perfil" });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toEqual(expect.objectContaining({ name: "Com Perfil", permissions: [] }));
  });

  it("GET /users/me reflete a edição", async () => {
    const user = await createUser({ name: "Antes" });

    await updateProfile(user.id, { name: "Depois" });
    const me = await app.inject({ method: "GET", url: ME_URL, cookies: sessionCookiesFor(user.id) });

    expect(me.json().user.name).toBe("Depois");
  });

  it.each([
    { field: "email", payload: { email: "outro@example.com" } },
    { field: "isActive", payload: { isActive: false } },
    { field: "password", payload: { password: "nova-senha-1", confirmPassword: "nova-senha-1" } },
    { field: "roleIds", payload: { roleIds: [] } },
  ])("campo fora do perfil ($field) responde 400 e nada muda", async ({ field, payload }) => {
    const user = await createUser({ name: "Intacto", email: "intacto@example.com" });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const response = await updateProfile(user.id, { name: "Mudado", ...payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain(`"${field}"`);
    expect(response.json().issues).toEqual([{ path: "", message: expect.stringContaining(`"${field}"`) }]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(before);
  });

  it.each([
    { path: "name", payload: { name: "A" }, message: "O nome precisa ter pelo menos 2 caracteres." },
    {
      path: "phone",
      payload: { phone: "123" },
      message: "O telefone deve possuir o formato (00) 0000-0000 ou (00) 90000-0000.",
    },
    { path: "image", payload: { image: "nao-e-url" }, message: "A imagem deve ser uma URL https válida." },
    {
      path: "idleTimeoutMinutes",
      payload: { idleTimeoutMinutes: 0 },
      message: "Informe um tempo de inatividade inteiro de 1 a 480 minutos.",
    },
    {
      path: "idleTimeoutMinutes",
      payload: { idleTimeoutMinutes: 481 },
      message: "Informe um tempo de inatividade inteiro de 1 a 480 minutos.",
    },
  ])("valor inválido em $path responde 400 com issues", async ({ path, payload, message }) => {
    const user = await createUser();

    const response = await updateProfile(user.id, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: `${path}: ${message}`, issues: [{ path, message }] });
  });

  it.each([
    { label: "javascript:", image: "javascript:alert(1)", message: "A imagem deve ser uma URL https válida." },
    { label: "data:", image: "data:image/png;base64,iVBORw0KGgo=", message: "A imagem deve ser uma URL https válida." },
    { label: "http:", image: "http://cdn.example.com/foto.png", message: "A imagem deve ser uma URL https válida." },
    {
      label: "acima de 2048 caracteres",
      image: `https://cdn.example.com/${"a".repeat(2048)}.png`,
      message: "A URL da imagem deve ter no máximo 2048 caracteres.",
    },
  ])("foto $label responde 400 e mantém a foto", async ({ image, message }) => {
    const user = await createUser({ image: "https://cdn.example.com/atual.png" });

    const response = await updateProfile(user.id, { image });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: `image: ${message}`, issues: [{ path: "image", message }] });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { image: true } })).toEqual({
      image: "https://cdn.example.com/atual.png",
    });
  });

  describe("tempo de inatividade até o limite da empresa", () => {
    it("aceita até o padrão da empresa sem configuração (20) e recusa acima dele, dizendo o limite", async () => {
      const user = await createUser({ idleTimeoutMinutes: null });

      const atLimit = await updateProfile(user.id, { idleTimeoutMinutes: 20 });
      const aboveLimit = await updateProfile(user.id, { idleTimeoutMinutes: 21 });

      expect(atLimit.statusCode).toBe(200);
      expect(atLimit.json().user.idleTimeoutMinutes).toBe(20);
      expect(aboveLimit.statusCode).toBe(400);
      expect(aboveLimit.json()).toEqual({
        message: "O tempo de inatividade pode ser de no máximo 20 minutos, o limite definido pela empresa.",
      });
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { idleTimeoutMinutes: true } }),
      ).toEqual({ idleTimeoutMinutes: 20 });
    });

    it("segue o valor configurado pela empresa", async () => {
      const company = await createCompany();
      await createSystemConfig({ companyId: company.id, key: "security.idleTimeoutMinutes", value: "60" });
      const user = await createUser({ companyId: company.id, idleTimeoutMinutes: 5 });

      const atLimit = await updateProfile(user.id, { idleTimeoutMinutes: 60 });
      const aboveLimit = await updateProfile(user.id, { idleTimeoutMinutes: 61 });

      expect(atLimit.statusCode).toBe(200);
      expect(aboveLimit.statusCode).toBe(400);
      expect(aboveLimit.json()).toEqual({
        message: "O tempo de inatividade pode ser de no máximo 60 minutos, o limite definido pela empresa.",
      });
    });

    it("acima do limite não grava nada, nem os outros campos, nem a trilha", async () => {
      const user = await createUser({ name: "Intacto", idleTimeoutMinutes: 10 });

      const response = await updateProfile(user.id, { name: "Mudado", idleTimeoutMinutes: 30 });

      expect(response.statusCode).toBe(400);
      expect(
        await prisma.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { name: true, idleTimeoutMinutes: true },
        }),
      ).toEqual({ name: "Intacto", idleTimeoutMinutes: 10 });
      expect(await findAuditLogs(user.companyId)).toEqual([]);
    });

    it("null (herdar) passa mesmo com a empresa no mínimo", async () => {
      const company = await createCompany();
      await createSystemConfig({ companyId: company.id, key: "security.idleTimeoutMinutes", value: "1" });
      const user = await createUser({ companyId: company.id, idleTimeoutMinutes: 1 });

      const response = await updateProfile(user.id, { idleTimeoutMinutes: null });

      expect(response.statusCode).toBe(200);
      expect(response.json().user.idleTimeoutMinutes).toBe(1);
    });
  });

  it("sem sessão responde 401", async () => {
    const response = await app.inject({ method: "PATCH", url: ME_URL, payload: { name: "Ninguém" } });

    expect(response.statusCode).toBe(401);
  });

  it("usuário bloqueado com a sessão aberta responde 403 e nada muda", async () => {
    const user = await createUser({ name: "Bloqueado", isActive: false });

    const response = await updateProfile(user.id, { name: "Mudado" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "Conta bloqueada." });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } })).toEqual({
      name: "Bloqueado",
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { type App, buildApp } from "@/app";
import { BadRequestError } from "@/lib/errors";

/** Rotas de apoio que lançam cada tipo de erro, para exercitar o `errorHandler` de ponta a ponta. */
async function registerErrorRoutes(app: App): Promise<void> {
  app.get("/boom", async () => {
    throw new Error("falha interna com detalhe sensível");
  });
  app.get("/app-error", async () => {
    throw new BadRequestError("Campo obrigatório.", { field: "name" });
  });
  app.get("/prisma-unique", async () => {
    throw Object.assign(new Error("Unique constraint"), { code: "P2002", clientVersion: "7.6.0" });
  });
  app.get("/prisma-unknown", async () => {
    throw Object.assign(new Error("Other"), { code: "P9999", clientVersion: "7.6.0" });
  });
  app.get("/bad-contract", { schema: { response: { 200: z.object({ id: z.string() }) } } }, async () => ({
    // O type provider pega isto em tempo de compilação; o cast simula um bug que só apareceria em runtime.
    id: 123 as unknown as string,
  }));
}

describe("errorHandler", () => {
  let app: App;

  beforeAll(async () => {
    app = buildApp();
    await registerErrorRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("erro inesperado responde 500 com mensagem genérica, sem vazar detalhes", async () => {
    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: "Oops! Encontramos um problema e nossa equipe foi notificada." });
    expect(response.body).not.toContain("sensível");
  });

  it("AppError responde com o status e os details informados", async () => {
    const response = await app.inject({ method: "GET", url: "/app-error" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Campo obrigatório.", details: { field: "name" } });
  });

  it("violação de unicidade do Prisma responde 409", async () => {
    const response = await app.inject({ method: "GET", url: "/prisma-unique" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "Já existe um registro com esses dados." });
  });

  it("erro desconhecido do Prisma responde 500 genérico", async () => {
    const response = await app.inject({ method: "GET", url: "/prisma-unknown" });

    expect(response.statusCode).toBe(500);
  });

  it("resposta fora do schema responde 500 (bug de contrato) em vez de vazar dado errado", async () => {
    const response = await app.inject({ method: "GET", url: "/bad-contract" });

    expect(response.statusCode).toBe(500);
  });
});

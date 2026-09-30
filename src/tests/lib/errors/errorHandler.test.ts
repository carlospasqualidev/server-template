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
  // Rota com parâmetro: o roteador recusa o parâmetro longo demais ou malformado antes de chegar a ela.
  app.get("/items/:itemId", async () => ({ ok: true }));
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

  describe("erro do roteador (antes da rota e dos hooks, por `frameworkErrors`)", () => {
    const ALLOWED_ORIGIN = "http://localhost:5173";
    const LONG_PARAM = "a".repeat(101);

    it("parâmetro acima do `maxParamLength` responde 414 no formato do projeto, sem repetir o caminho", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/items/${LONG_PARAM}`,
        headers: { origin: ALLOWED_ORIGIN },
      });

      expect(response.statusCode).toBe(414);
      expect(response.json()).toEqual({ message: "Parâmetro da URL muito longo." });
      expect(response.body).not.toContain(LONG_PARAM);
    });

    it("leva os cabeçalhos de CORS (origem permitida) e do helmet, como qualquer resposta da API", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/items/${LONG_PARAM}`,
        headers: { origin: ALLOWED_ORIGIN },
      });

      expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
      expect(response.headers.vary).toContain("Origin");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-security-policy"]).toBeDefined();
    });

    it("origem fora da allowlist não recebe `Access-Control-Allow-Origin`", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/items/${LONG_PARAM}`,
        headers: { origin: "https://evil.example.com" },
      });

      expect(response.statusCode).toBe(414);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("URL com codificação inválida no parâmetro responde 400 no formato do projeto, sem repetir o caminho", async () => {
      const response = await app.inject({ method: "GET", url: "/items/%E0%A4%A", headers: { origin: ALLOWED_ORIGIN } });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "URL inválida." });
      expect(response.body).not.toContain("%E0");
      expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    });
  });
});

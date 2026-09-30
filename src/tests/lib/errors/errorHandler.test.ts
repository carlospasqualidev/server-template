import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { type App, buildApp } from "@/app";
import { loadEnv } from "@/config/env";
import { buildLoggerOptions } from "@/config/logger";
import { BadRequestError, errorHandler } from "@/lib/errors";

interface LogLine {
  msg?: string;
  err?: Record<string, unknown>;
}

/**
 * App com o logger de produção (a suíte desliga o log) escrevendo numa lista em memória e o `errorHandler` nos erros
 * do roteador e das rotas, para ler o que ele grava.
 */
async function createLoggedApp() {
  const logger = buildLoggerOptions(
    loadEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost:5432/error-handler-test",
      JWT_SECRET: "error-handler-test-secret-16",
    }),
  );

  if (typeof logger !== "object") {
    throw new Error("O logger de produção precisa estar ligado.");
  }

  const output: string[] = [];
  const app = Fastify({
    logger: { ...logger, stream: { write: (line: string) => output.push(line) } },
    frameworkErrors: errorHandler,
  });
  app.setErrorHandler(errorHandler);
  app.get("/api/items/:itemId", async () => ({ ok: true }));
  // Valor lançado que não é `Error`: só o `statusCode`, sem `message` nem `stack`.
  app.get("/api/plain-error", async () => {
    throw { statusCode: 400 };
  });
  await app.ready();

  return { app, output, lines: () => output.map((line) => JSON.parse(line) as LogLine) };
}

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

    it("URL malformada com busca: o log leva a mensagem do roteador com a busca mascarada, e a resposta não muda", async () => {
      const logged = await createLoggedApp();

      try {
        const response = await logged.app.inject({ method: "GET", url: "/api/%E0?search=maria&page=0" });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ message: "URL inválida." });

        const warning = logged.lines().find((line) => line.msg === "URL inválida.");
        expect(warning?.err).toMatchObject({
          type: "FastifyError",
          code: "FST_ERR_BAD_URL",
          statusCode: 400,
          message: "'/api/%E0?search=[omitido]&page=0' is not a valid url component",
        });
        expect(warning?.err?.stack).toContain("'/api/%E0?search=[omitido]&page=0' is not a valid url component");
        expect(logged.output.join("")).not.toContain("maria");
      } finally {
        await logged.app.close();
      }
    });

    it("URL malformada sem busca: o erro vai ao log como o roteador o criou", async () => {
      const logged = await createLoggedApp();

      try {
        await logged.app.inject({ method: "GET", url: "/api/%E0?page=0" });

        const warning = logged.lines().find((line) => line.msg === "URL inválida.");
        expect(warning?.err).toMatchObject({
          type: "FastifyError",
          code: "FST_ERR_BAD_URL",
          message: "'/api/%E0?page=0' is not a valid url component",
        });
      } finally {
        await logged.app.close();
      }
    });
  });

  it("valor lançado que não é `Error`, com `statusCode` 4xx e sem `message`, numa URL com busca: resposta no formato do projeto e log sem o termo", async () => {
    const logged = await createLoggedApp();

    try {
      const response = await logged.app.inject({ method: "GET", url: "/api/plain-error?search=maria&page=0" });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Requisição inválida." });

      const warning = logged.lines().find((line) => line.msg === "Requisição inválida.");
      expect(warning?.err).toEqual({ statusCode: 400 });
      expect(logged.output.join("")).not.toContain("maria");
    } finally {
      await logged.app.close();
    }
  });
});

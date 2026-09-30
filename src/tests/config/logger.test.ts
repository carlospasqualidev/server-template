import { request as httpRequest } from "node:http";

import Fastify, { type FastifyServerOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { loadEnv } from "@/config/env";
import { buildLoggerOptions, maskSearchInText, maskSearchInUrl } from "@/config/logger";

/** O logger de produção (JSON), fora do ambiente da suíte, que desliga o log. */
const PRODUCTION_ENV = loadEnv({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://localhost:5432/logger-test",
  JWT_SECRET: "logger-test-secret-with-16-chars",
});

interface LogLine {
  msg?: string;
  req?: Record<string, unknown>;
}

type LoggerOptions = Exclude<FastifyServerOptions["logger"], boolean | undefined>;

function productionLoggerOptions(): LoggerOptions {
  const options = buildLoggerOptions(PRODUCTION_ENV);

  if (typeof options !== "object") {
    throw new Error("O logger de produção precisa estar ligado.");
  }

  return options;
}

const openApps: { close: () => Promise<unknown> }[] = [];

/** App com o logger escrevendo numa lista em memória: a saída é lida sem `console` nem arquivo. */
async function createLoggedApp(options: LoggerOptions) {
  const output: string[] = [];
  const app = Fastify({ logger: { ...options, stream: { write: (line: string) => output.push(line) } } });
  app.get("/api/client/users", async (request) => ({ query: request.query }));
  app.get("/api/client/roles/:roleId/users", async () => ({ users: [], count: 0 }));
  await app.ready();
  openApps.push(app);

  async function logOf(url: string) {
    output.length = 0;
    await app.inject({ method: "GET", url });
    const lines = output.map((line) => JSON.parse(line) as LogLine);

    return { output: output.join(""), req: lines.find((line) => line.msg === "incoming request")?.req };
  }

  /**
   * Pela rede, não por `inject`: o `inject` descarta o que vem depois de `#`, e o roteador do Fastify, pela rede,
   * lê a query a partir dele. Devolve também a query que a rota recebeu.
   */
  async function logOverHttp(path: string) {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    output.length = 0;

    const body = await new Promise<string>((resolve, reject) => {
      const outgoing = httpRequest({ host: "127.0.0.1", port, path, method: "GET" }, (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (text += chunk));
        response.on("end", () => resolve(text));
      });
      outgoing.on("error", reject);
      outgoing.end();
    });
    const lines = output.map((line) => JSON.parse(line) as LogLine);

    return {
      output: output.join(""),
      req: lines.find((line) => line.msg === "incoming request")?.req,
      query: (JSON.parse(body) as { query: Record<string, unknown> }).query,
    };
  }

  return { logOf, logOverHttp };
}

describe("buildLoggerOptions", () => {
  afterEach(async () => {
    await Promise.all(openApps.splice(0).map((app) => app.close()));
  });

  describe("log de requisição", () => {
    it("mascara o termo de busca e mantém o caminho e os demais parâmetros", async () => {
      const { logOf } = await createLoggedApp(productionLoggerOptions());

      const { output, req } = await logOf("/api/client/users?page=0&search=maria%40example.com&orderBy=name&order=asc");

      expect(req?.url).toBe("/api/client/users?page=0&search=[omitido]&orderBy=name&order=asc");
      expect(output).not.toContain("maria");
      expect(output).not.toContain("example.com");
    });

    it("o resto do registro é o do serializador padrão do Fastify", async () => {
      const url = "/api/client/users?search=maria%40example.com&isActive=true";
      const masked = await createLoggedApp(productionLoggerOptions());
      const fastifyDefault = await createLoggedApp({ level: "info" });

      const { req } = await masked.logOf(url);
      const { req: defaultReq } = await fastifyDefault.logOf(url);

      expect(defaultReq?.url).toBe(url);
      expect(req).toEqual({ ...defaultReq, url: "/api/client/users?search=[omitido]&isActive=true" });
      expect(req).toMatchObject({ method: "GET", host: "localhost:80", remoteAddress: "127.0.0.1" });
    });

    it.each([
      {
        scenario: "busca repetida",
        url: "/api/client/users?search=Maria+Alves&search=maria%40example.com",
        expected: "/api/client/users?search=[omitido]&search=[omitido]",
      },
      {
        scenario: "nome do parâmetro codificado",
        url: "/api/client/users?%73earch=maria&page=1",
        expected: "/api/client/users?%73earch=[omitido]&page=1",
      },
      {
        scenario: "rota com parâmetro",
        url: "/api/client/roles/0199a1b2-0000-7000-8000-000000000000/users?search=maria&pageSize=20",
        expected: "/api/client/roles/0199a1b2-0000-7000-8000-000000000000/users?search=[omitido]&pageSize=20",
      },
    ])("mascara a busca: $scenario", async ({ url, expected }) => {
      const { logOf } = await createLoggedApp(productionLoggerOptions());

      const { output, req } = await logOf(url);

      expect(req?.url).toBe(expected);
      expect(output.toLowerCase()).not.toContain("maria");
    });

    it("corta a query no primeiro `#`, como o roteador: a busca que a rota recebe depois dele sai mascarada", async () => {
      const { logOverHttp } = await createLoggedApp(productionLoggerOptions());

      const { output, req, query } = await logOverHttp("/api/client/users#search=maria&page=0");

      expect(query).toEqual({ search: "maria", page: "0" });
      expect(req?.url).toBe("/api/client/users#search=[omitido]&page=0");
      expect(output).not.toContain("maria");
    });

    it("URL sem busca sai como chegou, sem recodificar", async () => {
      const url = "/api/client/users?roleId=a,b&createdFrom=2026-09-01T03%3A00%3A00.000Z&searchable=sim";
      const { logOf } = await createLoggedApp(productionLoggerOptions());

      const { req } = await logOf(url);

      expect(req?.url).toBe(url);
    });
  });

  describe("maskSearchInUrl e maskSearchInText", () => {
    it.each([
      { url: "/users?search=maria", expected: "/users?search=[omitido]" },
      { url: "/users#search=maria", expected: "/users#search=[omitido]" },
      { url: "/users#page=0&search=maria", expected: "/users#page=0&search=[omitido]" },
      // O primeiro delimitador manda: depois dele, `?` e `#` são parte do valor, e aqui não há `search`.
      { url: "/users#page=0?search=maria", expected: "/users#page=0?search=maria" },
      { url: "/users?page=0#search=maria", expected: "/users?page=0#search=maria" },
      { url: "/users", expected: "/users" },
    ])("$url → $expected", ({ url, expected }) => {
      expect(maskSearchInUrl(url)).toBe(expected);
    });

    it("mascara a query da URL onde o texto a repete, mesmo sem o esquema e o host", () => {
      const url = "http://api.example.com/api/%E0?search=maria&page=0";

      expect(maskSearchInText("'/api/%E0?search=maria&page=0' is not a valid url component", url)).toBe(
        "'/api/%E0?search=[omitido]&page=0' is not a valid url component",
      );
      expect(maskSearchInText("sem a URL", url)).toBe("sem a URL");
    });
  });
});

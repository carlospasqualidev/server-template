import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type App, buildApp } from "@/app";

const HELMET_FAILURE = new Error("opção inválida do helmet");

// Só o import do `app.ts` (os cabeçalhos da resposta de erro do roteador) recebe este helmet, que falha; o
// `@fastify/helmet` das rotas carrega o dele por conta própria.
vi.mock("helmet", () => ({
  default: () => (_request: unknown, _response: unknown, next: (error?: unknown) => void) => next(HELMET_FAILURE),
}));

describe("erro do roteador com falha do helmet", () => {
  let app: App;

  beforeAll(async () => {
    app = buildApp();
    app.get("/items/:itemId", async () => ({ ok: true }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("a falha vai para o log com `warn` e a resposta sai assim mesmo, no formato do projeto", async () => {
    // Com o logger desligado (teste), `request.log` é o próprio `app.log`.
    const warn = vi.spyOn(app.log, "warn");

    const response = await app.inject({
      method: "GET",
      url: `/items/${"a".repeat(101)}`,
      headers: { origin: "http://localhost:5173" },
    });

    expect(response.statusCode).toBe(414);
    expect(response.json()).toEqual({ message: "Parâmetro da URL muito longo." });
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(warn).toHaveBeenCalledWith(
      { err: HELMET_FAILURE },
      "Falha ao aplicar os cabeçalhos do helmet na resposta de erro do roteador",
    );
  });
});

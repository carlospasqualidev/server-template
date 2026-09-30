import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type App } from "@/app";
import { createTestApp } from "@/tests/helpers/app";

describe("GET /health", () => {
  let app: App;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("responde ok com uptime", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", uptime: expect.any(Number) });
  });

  it("readiness consulta o banco", async () => {
    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("rota inexistente responde 404 com mensagem", async () => {
    const response = await app.inject({ method: "GET", url: "/nao-existe" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Rota não encontrada." });
  });

  it("publica o OpenAPI com as tags registradas", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    const document = response.json();

    expect(response.statusCode).toBe(200);
    expect(document.paths["/api/client/session/login"].post.tags).toEqual(["Session"]);
    expect(document.paths["/api/client/users"].get.security).toEqual([{ cookieAuth: [] }, { bearerAuth: [] }]);
    expect(document.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(document.paths["/api/client/session/login"].post.parameters).toContainEqual(
      expect.objectContaining({ in: "header", name: "x-client-type", schema: { type: "string", enum: ["mobile"] } }),
    );
    expect(document.paths["/api/client/users/{userId}"].get.parameters[0].schema.format).toBe("uuid");
    expect(document.paths["/api/client/upload/file"].post.requestBody.content["multipart/form-data"]).toBeDefined();
  });
});

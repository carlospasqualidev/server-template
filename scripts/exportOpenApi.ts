import { mkdir, writeFile } from "node:fs/promises";

// Valores só para montar a app; nenhuma conexão é aberta.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost:5432/openapi-export";
process.env.JWT_SECRET ??= "openapi-export-placeholder-secret";

const { buildApp } = await import("@/app");

const app = buildApp();
await app.ready();

const document = app.swagger();
await mkdir("docs", { recursive: true });
await writeFile("docs/openapi.json", `${JSON.stringify(document, null, 2)}\n`);
await app.close();

console.info(`OpenAPI exportado para docs/openapi.json (${Object.keys(document.paths ?? {}).length} rotas).`);

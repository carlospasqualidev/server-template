import { config as parseDotenv } from "dotenv";

const TEST_DATABASE_NAME = "server_template_test";

/** Lê o `.env` local sem tocar em `process.env` (a suíte é hermética; só o endereço do banco vem de lá). */
function readLocalDatabaseUrl(): string | undefined {
  const parsed = parseDotenv({ path: ".env", processEnv: {}, quiet: true }).parsed;

  return parsed?.DATABASE_URL;
}

/** Mesmo servidor e credenciais do banco de desenvolvimento, trocando só o nome do banco. */
function deriveTestDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${TEST_DATABASE_NAME}`;

  return url.toString();
}

/**
 * Banco de teste, nesta ordem: `TEST_DATABASE_URL` (CI), derivado do `DATABASE_URL` do arquivo `.env` (máquina local),
 * ou o Postgres padrão do docker compose. Só o arquivo `.env` é lido, nunca `DATABASE_URL` do shell, para a suíte
 * jamais criar um banco `_test` num servidor que não seja o de desenvolvimento. O `globalSetup` cria o banco se não existir e exige o sufixo `_test`.
 */
function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;

  if (explicit) {
    return explicit;
  }

  const localDatabaseUrl = readLocalDatabaseUrl();

  if (localDatabaseUrl) {
    return deriveTestDatabaseUrl(localDatabaseUrl);
  }

  return `postgresql://postgres:postgres@localhost:5432/${TEST_DATABASE_NAME}`;
}

export const TEST_DATABASE_URL = resolveTestDatabaseUrl();

/** Ambiente sintético da suíte: hermético em relação ao `.env` local, exceto pelo endereço do banco. */
export const testEnv = {
  NODE_ENV: "test",
  PORT: "8080",
  PROJECT_NAME: "ServerTest",
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: "test-secret-with-at-least-16-chars",
  SESSION_TTL_HOURS: "1",
  CORS_ORIGINS: "http://localhost:5173",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_S3_BUCKET: "test-bucket",
  AWS_BUCKET_REGION: "us-east-1",
} satisfies Record<string, string>;

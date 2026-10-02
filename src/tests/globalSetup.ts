import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { config as parseDotenv } from "dotenv";
import { Client } from "pg";

import {
  assertTemporaryDatabase,
  isOrphanTemporaryDatabase,
  quoteIdentifier,
  resolveTestServer,
  TEMPORARY_DATABASE_PREFIX,
  temporaryDatabaseName,
  withDatabaseName,
} from "@/tests/testDatabase";

import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** URL do banco temporário desta execução, lida pelos workers em `temporaryDatabaseEnv.ts`. */
    testDatabaseUrl: string;
  }
}

/** Lê o `.env` local sem tocar em `process.env` (a suíte é hermética; só o endereço do servidor vem de lá). */
function readDotenvDatabaseUrl(): string | undefined {
  return parseDotenv({ path: ".env", processEnv: {}, quiet: true }).parsed?.DATABASE_URL;
}

async function withMaintenanceClient<T>(serverUrl: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: withDatabaseName(serverUrl, "postgres") });
  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function dropDatabase(client: Client, databaseName: string): Promise<void> {
  assertTemporaryDatabase(databaseName);
  await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
}

/**
 * Apaga os temporários velhos de execuções que morreram sem teardown; os recentes podem estar em uso. Órfão com
 * conexão ativa fica, e o DROP é sem FORCE: se alguém conectar no meio, ele falha, é registrado e a suíte segue.
 */
async function dropOrphanDatabases(client: Client, now: Date): Promise<void> {
  const result = await client.query<{ datname: string }>(
    `SELECT d.datname FROM pg_database AS d
      WHERE starts_with(d.datname, $1)
        AND NOT EXISTS (SELECT 1 FROM pg_stat_activity AS a WHERE a.datname = d.datname)`,
    [TEMPORARY_DATABASE_PREFIX],
  );

  for (const { datname } of result.rows) {
    if (!isOrphanTemporaryDatabase(datname, now)) {
      continue;
    }

    assertTemporaryDatabase(datname);

    try {
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(datname)}`);
    } catch (error) {
      console.warn(`Banco órfão ${datname} não foi apagado: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Uma vez por execução: cria um banco `temporary-int-*` só desta execução, aplica as migrations e entrega a URL
 * aos workers. O teardown apaga o banco, com a suíte verde ou vermelha. Execuções simultâneas não se veem.
 */
export default async function globalSetup(project: TestProject): Promise<() => Promise<void>> {
  const { serverUrl, warning } = resolveTestServer({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    dotenvDatabaseUrl: readDotenvDatabaseUrl(),
  });

  if (warning) {
    console.warn(warning);
  }

  const now = new Date();
  const databaseName = temporaryDatabaseName(now, randomBytes(4).toString("hex"));
  const databaseUrl = withDatabaseName(serverUrl, databaseName);

  await withMaintenanceClient(serverUrl, async (client) => {
    await dropOrphanDatabases(client, now);
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  });

  const teardown = () => withMaintenanceClient(serverUrl, (client) => dropDatabase(client, databaseName));

  try {
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
  } catch (error) {
    await teardown();
    throw error;
  }

  project.provide("testDatabaseUrl", databaseUrl);

  return teardown;
}

import { execSync } from "node:child_process";

import { Client } from "pg";

import { TEST_DATABASE_URL } from "@/tests/testEnv";

/** Cria o banco de teste se não existir e aplica as migrations. Roda uma vez por execução da suíte. */
export default async function globalSetup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const databaseName = url.pathname.replace(/^\//, "");

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Banco de teste precisa terminar com "_test" (recebido: "${databaseName}"). A suíte trunca tabelas.`,
    );
  }

  await ensureDatabaseExists(url, databaseName);

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}

async function ensureDatabaseExists(url: URL, databaseName: string): Promise<void> {
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();

  try {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);

    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end();
  }
}

/**
 * Ambiente sintético da suíte: hermético em relação ao `.env` local. `DATABASE_URL` fica de fora: é a do banco
 * temporário desta execução, criada pelo `globalSetup` e aplicada em cada worker por `temporaryDatabaseEnv.ts`.
 */
export const testEnv = {
  NODE_ENV: "test",
  PORT: "8080",
  PROJECT_NAME: "ServerTest",
  JWT_SECRET: "test-secret-with-at-least-16-chars",
  SESSION_TTL_HOURS: "1",
  CORS_ORIGINS: "http://localhost:5173",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_S3_BUCKET: "test-bucket",
  AWS_BUCKET_REGION: "us-east-1",
} satisfies Record<string, string>;

/**
 * `DATABASE_URL` do projeto `unit` (`*.unit.test.ts`), que não tem banco: o `@/config/env` exige a variável, e a porta
 * 1 recusa a conexão na hora, então um teste unit que consulte o banco falha em vez de passar por acaso.
 */
export const UNIT_TEST_DATABASE_URL = "postgresql://unit:unit@127.0.0.1:1/unit-tests-have-no-database";

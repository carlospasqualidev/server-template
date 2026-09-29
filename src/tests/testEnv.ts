/**
 * Ambiente sintético da suíte: hermético em relação ao `.env` local.
 * O banco de teste vem de `TEST_DATABASE_URL` (CI) ou do Postgres do docker compose.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/server_template_test";

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

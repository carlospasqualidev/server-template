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

import { z } from "zod";

/** Trata string vazia (`VAR=`) como ausente. */
const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());

const optionalLogLevel = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(8080),
    PROJECT_NAME: z.string().min(1).default("Server"),
    PROJECT_ENVIRONMENT: optionalString,
    LOG_LEVEL: optionalLogLevel,
    DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória."),
    JWT_SECRET: z.string().min(16, "JWT_SECRET precisa ter pelo menos 16 caracteres."),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
    CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:4173"),
    ERROR_LOG_URL: optionalUrl,
    AWS_ACCESS_KEY_ID: optionalString,
    AWS_SECRET_ACCESS_KEY: optionalString,
    AWS_S3_BUCKET: optionalString,
    AWS_BUCKET_REGION: optionalString,
  })
  .transform((values) => {
    const storage =
      values.AWS_ACCESS_KEY_ID && values.AWS_SECRET_ACCESS_KEY && values.AWS_S3_BUCKET && values.AWS_BUCKET_REGION
        ? {
            accessKeyId: values.AWS_ACCESS_KEY_ID,
            secretAccessKey: values.AWS_SECRET_ACCESS_KEY,
            bucket: values.AWS_S3_BUCKET,
            region: values.AWS_BUCKET_REGION,
          }
        : null;

    return {
      ...values,
      PROJECT_ENVIRONMENT: values.PROJECT_ENVIRONMENT ?? values.NODE_ENV,
      isProduction: values.NODE_ENV === "production",
      isTest: values.NODE_ENV === "test",
      sessionTtlSeconds: values.SESSION_TTL_HOURS * 60 * 60,
      corsOrigins: values.CORS_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      /** Credenciais do S3, ou `null` quando o upload não está configurado neste ambiente. */
      storage,
    };
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}

/**
 * Único ponto de leitura de `process.env`. Valida na inicialização: variável obrigatória ausente derruba a API
 * com uma mensagem clara em vez de falhar no meio de uma requisição.
 */
export const env = loadEnv();

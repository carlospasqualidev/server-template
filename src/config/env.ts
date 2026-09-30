import { z } from "zod";

/** Trata string vazia (`VAR=`) como ausente. */
const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());

const optionalLogLevel = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
);

/** `true` ou `false`, por extenso; vazio é ausente. (`z.coerce.boolean()` leria `"false"` como verdadeiro.) */
const optionalBoolean = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .enum(["true", "false"], { message: "Use true ou false." })
    .transform((value) => value === "true")
    .optional(),
);

function splitOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

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
    // A sessão vai em cookie (`credentials: true`): com `*` o navegador recusa a resposta, e o espelho do CORS na
    // resposta de erro do roteador (`corsHeadersFor`) deixaria de bater com o plugin. Liste as origens.
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173,http://localhost:4173")
      .refine(
        (value) => !splitOrigins(value).includes("*"),
        "CORS_ORIGINS não aceita `*`: a sessão usa cookie (credenciais); liste as origens permitidas.",
      ),
    ERROR_LOG_URL: optionalUrl,
    AWS_ACCESS_KEY_ID: optionalString,
    AWS_SECRET_ACCESS_KEY: optionalString,
    AWS_S3_BUCKET: optionalString,
    AWS_BUCKET_REGION: optionalString,
    AUDIT_RETENTION_ENABLED: optionalBoolean,
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
    const isTest = values.NODE_ENV === "test";

    return {
      ...values,
      PROJECT_ENVIRONMENT: values.PROJECT_ENVIRONMENT ?? values.NODE_ENV,
      isProduction: values.NODE_ENV === "production",
      isTest,
      sessionTtlSeconds: values.SESSION_TTL_HOURS * 60 * 60,
      corsOrigins: splitOrigins(values.CORS_ORIGINS),
      /** Credenciais do S3, ou `null` quando o upload não está configurado neste ambiente. */
      storage,
      /**
       * O `server.ts` agenda a retenção diária da trilha de auditoria: ligada por padrão, sempre desligada em teste
       * (a suíte roda a retenção pelo service, com o relógio que escolhe).
       */
      auditRetentionEnabled: !isTest && (values.AUDIT_RETENTION_ENABLED ?? true),
    };
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Valida as variáveis de `source` (padrão: `process.env`). Os testes passam um ambiente próprio para provar as regras.
 */
export function loadEnv(source: Readonly<Record<string, string | undefined>> = process.env): Env {
  const result = envSchema.safeParse(source);

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

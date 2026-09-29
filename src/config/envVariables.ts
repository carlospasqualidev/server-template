function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }

  return value;
}

export const envVariables = {
  PORT: process.env.PORT ? Number(process.env.PORT) : 8080,
  JWT_SECRET: getEnv("JWT_SECRET"),
  DATABASE_URL: getEnv("DATABASE_URL"),
  ENVIRONMENT: getEnv("ENVIRONMENT"),
  PROJECT_NAME: getEnv("PROJECT_NAME"),
  AWS_ACCESS_KEY_ID: getEnv("AWS_ACCESS_KEY_ID"),
  AWS_SECRET_ACCESS_KEY: getEnv("AWS_SECRET_ACCESS_KEY"),
  AWS_S3_BUCKET: getEnv("AWS_S3_BUCKET"),
  AWS_BUCKET_REGION: getEnv("AWS_BUCKET_REGION"),
};

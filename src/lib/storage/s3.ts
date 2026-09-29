import { S3Client } from "@aws-sdk/client-s3";

import { env } from "@/config/env";
import { ServiceUnavailableError } from "@/lib/errors/appError";

let s3Client: S3Client | null = null;

export function isStorageConfigured(): boolean {
  return env.storage !== null;
}

/** Credenciais e bucket do S3. Lança 503 quando as variáveis `AWS_*` não estão definidas. */
export function getStorageConfig() {
  if (!env.storage) {
    throw new ServiceUnavailableError("Upload de arquivos não está configurado neste ambiente.");
  }

  return env.storage;
}

export function getS3Client(): S3Client {
  const { accessKeyId, secretAccessKey, region } = getStorageConfig();

  s3Client ??= new S3Client({ credentials: { accessKeyId, secretAccessKey }, region });

  return s3Client;
}

/** URL pública do objeto. Exige bucket com política de leitura pública (ACL por objeto não é usada). */
export function buildPublicFileUrl(fileKey: string): string {
  const { bucket, region } = getStorageConfig();

  return `https://${bucket}.s3.${region}.amazonaws.com/${fileKey}`;
}

import { randomUUID } from "node:crypto";
import path from "node:path";
import { Transform } from "node:stream";

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { type MultipartFile } from "@fastify/multipart";

import { BadRequestError } from "@/lib/errors";
import { buildPublicFileUrl, getS3Client, getStorageConfig } from "@/lib/storage/s3";

export interface UploadedFile {
  Location: string;
  key: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

function buildFileKey(originalName: string): string {
  const extension = path.extname(originalName).toLowerCase();

  return `${Date.now()}-${randomUUID()}${extension}`;
}

function sanitizeMetadataValue(value: string): string {
  return encodeURIComponent(value.normalize("NFC"));
}

/** Faz streaming do arquivo para o S3 (sem gravar em disco) e conta os bytes no caminho. */
export async function uploadFileService(file: MultipartFile): Promise<UploadedFile> {
  const { bucket } = getStorageConfig();
  const key = buildFileKey(file.filename);
  let size = 0;

  const byteCounter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      callback(null, chunk);
    },
  });

  const upload = new Upload({
    client: getS3Client(),
    params: {
      Bucket: bucket,
      Key: key,
      Body: file.file.pipe(byteCounter),
      ContentType: file.mimetype,
      Metadata: { originalName: sanitizeMetadataValue(file.filename) },
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  });

  await upload.done();

  if (size === 0) {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

    throw new BadRequestError("O arquivo enviado está vazio.");
  }

  return {
    Location: buildPublicFileUrl(key),
    key,
    fileName: path.basename(key),
    originalName: file.filename,
    mimeType: file.mimetype,
    size,
  };
}

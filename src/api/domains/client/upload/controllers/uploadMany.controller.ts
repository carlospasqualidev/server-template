import { randomUUID } from "node:crypto";
import path from "node:path";
import { Transform } from "node:stream";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { MultipartFile, MultipartValue } from "@fastify/multipart";
import { FastifyReply, FastifyRequest } from "fastify";
import { ErrorMessage } from "../../../../utils/error";
import { envVariables } from "../../../../../config/envVariables";
import { buildPublicFileUrl, getS3Client } from "../utils/s3";

interface UploadedFileResponse {
  fieldName: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  key: string;
  url: string;
}

function sanitizeMetadataValue(value: string) {
  return encodeURIComponent(value.normalize("NFC"));
}

function buildFileKey(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();

  return `${Date.now()}-${randomUUID()}${extension}`;
}

function isMultipartFile(part: MultipartFile | MultipartValue): part is MultipartFile {
  return "file" in part;
}

async function uploadFileToS3(file: MultipartFile): Promise<UploadedFileResponse> {
  const fileKey = buildFileKey(file.filename);
  let totalSize = 0;

  const countingStream = new Transform({
    transform(chunk, _encoding, callback) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalSize += bufferChunk.length;
      callback(null, bufferChunk);
    },
  });

  const upload = new Upload({
    client: getS3Client(),
    params: {
      Bucket: envVariables.AWS_S3_BUCKET,
      Key: fileKey,
      Body: file.file.pipe(countingStream),
      ContentType: file.mimetype,
      ACL: "public-read",
      Metadata: {
        fieldName: sanitizeMetadataValue(file.fieldname),
        originalName: sanitizeMetadataValue(file.filename),
      },
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  });

  await upload.done();

  if (!totalSize) {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: envVariables.AWS_S3_BUCKET,
        Key: fileKey,
      }),
    );

    throw new ErrorMessage({
      statusCode: "400 BAD REQUEST",
      message: "Nenhum arquivo válido foi enviado.",
    });
  }

  return {
    fieldName: file.fieldname,
    fileName: path.basename(fileKey),
    originalName: file.filename,
    mimeType: file.mimetype,
    size: totalSize,
    key: fileKey,
    url: buildPublicFileUrl(fileKey),
  };
}

export async function uploadManyController(request: FastifyRequest, reply: FastifyReply) {
  if (!request.isMultipart()) {
    throw new ErrorMessage({
      statusCode: "400 BAD REQUEST",
      message: "Envie os arquivos usando multipart/form-data.",
    });
  }

  const parts = request.parts();
  const uploadPromises: Promise<UploadedFileResponse>[] = [];
  let receivedFile = false;

  for await (const part of parts) {
    if (!isMultipartFile(part)) {
      continue;
    }

    if (part.fieldname !== "files") {
      throw new ErrorMessage({
        statusCode: "400 BAD REQUEST",
        message: "Use o campo [files] para enviar os arquivos.",
      });
    }

    receivedFile = true;
    uploadPromises.push(uploadFileToS3(part));
  }

  if (!receivedFile) {
    throw new ErrorMessage({
      statusCode: "400 BAD REQUEST",
      message: "Nenhum arquivo foi enviado no campo [files].",
    });
  }

  const uploadedFiles = await Promise.all(uploadPromises);

  return reply.status(200).send({ files: uploadedFiles });
}

import { type FastifyReply, type FastifyRequest } from "fastify";

import { BadRequestError } from "@/lib/errors";
import { getStorageConfig } from "@/lib/storage/s3";
import { uploadFileService } from "@/modules/upload/services/uploadFile.service";

export async function uploadFileController(request: FastifyRequest, reply: FastifyReply) {
  // Falha cedo (503) antes de consumir o stream quando o storage não está configurado.
  getStorageConfig();

  if (!request.isMultipart()) {
    throw new BadRequestError("Envie o arquivo usando multipart/form-data.");
  }

  const file = await request.file();

  if (!file) {
    throw new BadRequestError("Nenhum arquivo foi enviado no campo [file].");
  }

  if (file.fieldname !== "file") {
    throw new BadRequestError("Use o campo [file] para enviar o arquivo.");
  }

  const uploadedFile = await uploadFileService(file);

  return reply.status(201).send(uploadedFile);
}

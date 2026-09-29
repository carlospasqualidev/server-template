import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import {
  formatUploadFileSizeInMb,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_FILE_SIZE_IN_BYTES,
} from "../../domains/client/upload/utils/upload.constants";
import { ErrorMessage } from "./errorMessage";
import { sendErrorToServerLog } from "./sendErrorToServerLog";

function handlePrismaErrors(error: unknown) {
  const prismaError = error as { code?: string; meta?: { target?: string } };
  const customErrors: Record<string, string> = {
    P2002: `A informação: ${prismaError.meta?.target} já existe na base de dados.`,
    P2003: "Identificador único não encontrado na base de dados.",
    P2024: "Erro de comunicação com a base de dados.",
    P2025: "Registro não encontrado na base de dados.",
  };

  return customErrors[prismaError.code ?? ""] || "Oops! Encontramos um problema e nossa equipe foi notificada.";
}

export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ErrorMessage) {
    return reply.status(err.statusCode).send({
      message: err.message,
    });
  }

  if ("code" in err && err.code === "FST_REQ_FILE_TOO_LARGE") {
    return reply.status(400).send({
      message: `Tamanho máximo por arquivo: ${formatUploadFileSizeInMb(MAX_UPLOAD_FILE_SIZE_IN_BYTES)} MB.`,
    });
  }

  if ("code" in err && err.code === "FST_FILES_LIMIT") {
    return reply.status(400).send({
      message: `Máximo de ${MAX_UPLOAD_FILES} arquivos por envio.`,
    });
  }

  sendErrorToServerLog({
    stack: err.stack,
    extraInfo: { user: req.user?.name, routeUrL: req.routeOptions?.url ?? req.url },
  });

  console.error("\n\n\n ❌ Error ❌ \n\n\n", "Error Message: ", err.stack, "\n\n\n");

  return reply.status(500).send({
    message: handlePrismaErrors(err),
  });
}

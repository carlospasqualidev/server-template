import { type FastifyError, type FastifyReply, type FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";

import { MAX_UPLOAD_FILE_SIZE_IN_BYTES } from "@/config/constants";
import { maskSearchInText } from "@/config/logger";
import { AppError } from "@/lib/errors/appError";
import { reportError } from "@/lib/errors/reportError";

const GENERIC_MESSAGE = "Oops! Encontramos um problema e nossa equipe foi notificada.";

const MAX_UPLOAD_FILE_SIZE_IN_MB = MAX_UPLOAD_FILE_SIZE_IN_BYTES / (1024 * 1024);

/**
 * Erros do próprio Fastify e plugins (código → mensagem pt-BR). A mensagem original de alguns repete o caminho
 * (`FST_ERR_MAX_PARAM_LENGTH`, `FST_ERR_BAD_URL`, do roteador): nunca a devolva.
 */
const fastifyErrorMessages = new Map<string, string>([
  ["FST_ERR_MAX_PARAM_LENGTH", "Parâmetro da URL muito longo."],
  ["FST_ERR_BAD_URL", "URL inválida."],
  ["FST_ERR_CTP_EMPTY_JSON_BODY", "Corpo da requisição vazio."],
  ["FST_ERR_CTP_INVALID_JSON_BODY", "JSON inválido."],
  ["FST_ERR_CTP_INVALID_MEDIA_TYPE", "Tipo de conteúdo não suportado."],
  ["FST_ERR_CTP_BODY_TOO_LARGE", "Corpo da requisição muito grande."],
  ["FST_INVALID_MULTIPART_CONTENT_TYPE", "Envie o arquivo usando multipart/form-data."],
  ["FST_REQ_FILE_TOO_LARGE", `Tamanho máximo por arquivo: ${MAX_UPLOAD_FILE_SIZE_IN_MB} MB.`],
  ["FST_FILES_LIMIT", "Quantidade de arquivos acima do permitido."],
  ["FST_PARTS_LIMIT", "Quantidade de campos acima do permitido."],
]);

/** Fallback por status quando o código do erro não está mapeado. */
const statusMessages = new Map<number, string>([
  [400, "Requisição inválida."],
  [401, "Não autenticado."],
  [403, "Acesso negado."],
  [404, "Registro não encontrado."],
  [413, "Conteúdo muito grande."],
  [415, "Tipo de conteúdo não suportado."],
  [429, "Muitas tentativas. Aguarde um instante e tente novamente."],
]);

/** Erros conhecidos do Prisma que têm significado HTTP claro. Os demais viram 500. */
const prismaErrorResponses = new Map<string, { statusCode: number; message: string }>([
  ["P2002", { statusCode: 409, message: "Já existe um registro com esses dados." }],
  ["P2003", { statusCode: 400, message: "Referência inválida: o registro relacionado não existe." }],
  ["P2025", { statusCode: 404, message: "Registro não encontrado." }],
]);

function isPrismaKnownError(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "clientVersion" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

function readStatusCode(error: unknown): number {
  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return typeof statusCode === "number" ? statusCode : 500;
}

interface ValidationIssue {
  path: string;
  message: string;
}

/** Converte o erro de validação do type provider (`instancePath`, um JSON pointer) em `campo.subcampo`. */
function readValidationIssue(validationError: { instancePath?: string; message?: string }): ValidationIssue {
  return {
    path: (validationError.instancePath ?? "").split("/").filter(Boolean).join("."),
    message: validationError.message ?? "Valor inválido.",
  };
}

function readErrorCode(error: unknown): string {
  const code = (error as { code?: unknown }).code;

  return typeof code === "string" ? code : "";
}

/**
 * O erro como vai para o log. A mensagem (e a pilha, que a repete) de `FST_ERR_BAD_URL` traz a URL inteira, com a
 * query: ali a busca sai mascarada, como no registro da requisição. Cópia do mesmo tipo, para o serializador de erro
 * do pino gravar os mesmos campos; o erro original, sem busca a mascarar, vai como está. Valor lançado que não é
 * `Error` pode não ter `message` ou `stack` em texto: o campo que não for string fica como veio.
 */
function errorForLog(error: Error, url: string): Error {
  const { message, stack } = error as { message?: unknown; stack?: unknown };
  const maskedMessage = typeof message === "string" ? maskSearchInText(message, url) : message;
  const maskedStack = typeof stack === "string" ? maskSearchInText(stack, url) : stack;

  if (maskedMessage === message && maskedStack === stack) {
    return error;
  }

  const masked: Error = Object.assign(Object.create(Object.getPrototypeOf(error)), error);
  Object.defineProperty(masked, "message", { value: maskedMessage, writable: true, configurable: true });
  Object.defineProperty(masked, "stack", { value: maskedStack, writable: true, configurable: true });

  return masked;
}

/**
 * Tradutor único de erro → resposta HTTP `{ message, ... }`.
 * Ordem: AppError → validação Zod (400) → serialização (500, bug de contrato) → Prisma → erros do Fastify (4xx) → 500.
 */
export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      message: error.message,
      ...(error.details !== undefined && { details: error.details }),
    });
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    const issues = error.validation.map((validationError) => readValidationIssue(validationError));
    const firstIssue = issues.at(0);
    let message = "Dados inválidos.";

    if (firstIssue) {
      message = firstIssue.path ? `${firstIssue.path}: ${firstIssue.message}` : firstIssue.message;
    }

    return reply.status(400).send({ message, issues });
  }

  if (isResponseSerializationError(error)) {
    request.log.error({ err: error, cause: error.cause }, "Resposta fora do contrato do schema de resposta");

    return reply.status(500).send({ message: GENERIC_MESSAGE });
  }

  if (isPrismaKnownError(error)) {
    const mapped = prismaErrorResponses.get(error.code);

    if (mapped) {
      request.log.warn({ err: error }, mapped.message);

      return reply.status(mapped.statusCode).send({ message: mapped.message });
    }
  }

  const statusCode = readStatusCode(error);

  if (statusCode < 500) {
    const message =
      fastifyErrorMessages.get(readErrorCode(error)) ?? statusMessages.get(statusCode) ?? "Requisição inválida.";
    request.log.warn({ err: errorForLog(error, request.url) }, message);

    return reply.status(statusCode).send({ message });
  }

  request.log.error({ err: error }, "Erro não tratado");
  void reportError(error, {
    requestId: String(request.id),
    method: request.method,
    url: request.url,
    userId: request.user?.id,
  });

  return reply.status(500).send({ message: GENERIC_MESSAGE });
}

export function notFoundHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send({ message: "Rota não encontrada." });
}

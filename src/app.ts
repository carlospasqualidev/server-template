import "@/lib/validation/locale";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { fastifyRequestContext } from "@fastify/request-context";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import helmetMiddleware from "helmet";

import { MAX_UPLOAD_FILE_SIZE_IN_BYTES } from "@/config/constants";
import { corsHeadersFor, corsOptions } from "@/config/cors";
import { buildLoggerOptions } from "@/config/logger";
import { swaggerOptions, swaggerUiOptions } from "@/config/swagger";
import { buildAuditRequestMetadata } from "@/lib/audit/auditContext";
import { errorHandler, notFoundHandler } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { healthRoutes } from "@/modules/health/health.routes";
import { type ApiRoutesOptions, apiRoutes } from "@/routes";

export type BuildAppOptions = ApiRoutesOptions;

/** Os mesmos cabeçalhos do `@fastify/helmet` (registrado sem opções abaixo), para a resposta que não passa por ele. */
const applyHelmetHeaders = helmetMiddleware();

/**
 * Erro do roteador (parâmetro acima do `maxParamLength`, URL malformada) acontece antes da rota e dos hooks, então a
 * resposta não passa pelo helmet nem pelo CORS: os dois são aplicados aqui, e o `errorHandler` responde no formato do
 * projeto, em pt-BR e sem repetir o caminho.
 */
function frameworkErrorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  applyHelmetHeaders(request.raw, reply.raw, () => undefined);
  reply.headers(corsHeadersFor(request.headers.origin));

  return errorHandler(error, request, reply);
}

/** Monta a aplicação sem escutar porta. `server.ts` sobe o HTTP; os testes usam `app.inject()`. */
export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: buildLoggerOptions(),
    frameworkErrors: frameworkErrorHandler,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod valida request e serializa response a partir dos schemas das rotas.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorateRequest("user", null);

  // Contexto por requisição (AsyncLocalStorage): leva requestId, IP, user-agent e, depois do `requireSession`, o autor
  // até a gravação da trilha de auditoria. Só a auditoria lê; regra de negócio recebe dados por argumento.
  app.register(fastifyRequestContext, {
    defaultStoreValues: (request) => ({ audit: buildAuditRequestMetadata(request) }),
  });
  app.register(helmet);
  app.register(cors, corsOptions);
  app.register(cookie);
  app.register(rateLimit, { global: false });
  app.register(multipart, { limits: { fileSize: MAX_UPLOAD_FILE_SIZE_IN_BYTES, files: 1 }, throwFileSizeLimit: true });
  app.register(swagger, swaggerOptions);
  app.register(swaggerUi, swaggerUiOptions);

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  app.register(healthRoutes, { prefix: "/health" });
  app.register(apiRoutes, { prefix: "/api", loginRateLimitMax: options.loginRateLimitMax });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}

export type App = ReturnType<typeof buildApp>;

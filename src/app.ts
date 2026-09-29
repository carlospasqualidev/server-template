import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart, { ajvFilePlugin } from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { MAX_UPLOAD_FILES, MAX_UPLOAD_FILE_SIZE_IN_BYTES } from "./api/domains/client/upload/utils/upload.constants";
import { corsOptions } from "./config/corsOptions";
import { swaggerOptions, swaggerUiOptions } from "./config/swagger";
import { errorHandler } from "./api/utils/error";
import { routes } from "./api/routes";

export function buildApp() {
  const app = Fastify({
    ajv: {
      plugins: [ajvFilePlugin as any],
    } as any,
  });

  app.decorateRequest("user", null);

  app.register(helmet);
  app.register(cors, corsOptions);
  app.register(cookie);
  app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_FILE_SIZE_IN_BYTES,
      files: MAX_UPLOAD_FILES,
    },
    throwFileSizeLimit: true,
  });
  app.register(swagger, swaggerOptions);

  app.setErrorHandler(errorHandler);
  app.register(routes, { prefix: "/api" });
  app.register(swaggerUi, swaggerUiOptions);

  return app;
}

export const app = buildApp();

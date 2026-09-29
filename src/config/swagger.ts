import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger";
import type { FastifySwaggerUiOptions } from "@fastify/swagger-ui";
import { envVariables } from "./envVariables";

const tags: { name: string; description: string }[] = [
  {
    name: "Session",
    description: "Autenticação e controle de sessão.",
  },
  {
    name: "Upload",
    description: "Operações de envio de arquivos.",
  },
  {
    name: "Users",
    description: "Operações relacionadas aos usuários.",
  },
];

export const swaggerOptions: FastifyDynamicSwaggerOptions = {
  mode: "dynamic",
  openapi: {
    openapi: "3.1.0",
    info: {
      title: `${envVariables.PROJECT_NAME} API`,
      description: "Documentação automática da API gerada a partir das rotas Fastify.",
      version: "1.0.0",
    },
    servers: [
      {
        url: `http://localhost:${envVariables.PORT}`,
        description: "Ambiente local",
      },
    ],
    tags,
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "token",
          description: "JWT enviado no cookie HTTP-only `token`.",
        },
      },
    },
  },
};

export const swaggerUiOptions: FastifySwaggerUiOptions = {
  routePrefix: "/docs",
  uiConfig: {
    deepLinking: true,
    docExpansion: "list",
    displayRequestDuration: true,
  },
  staticCSP: true,
  transformSpecificationClone: true,
};

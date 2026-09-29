import { type FastifyDynamicSwaggerOptions } from "@fastify/swagger";
import { type FastifySwaggerUiOptions } from "@fastify/swagger-ui";
import { jsonSchemaTransform, jsonSchemaTransformObject } from "fastify-type-provider-zod";

import { SESSION_COOKIE_NAME } from "@/config/constants";
import { env } from "@/config/env";

/** Toda tag usada em `tags:` de um schema de rota precisa estar registrada aqui, com descrição. */
const tags: { name: string; description: string }[] = [
  { name: "Health", description: "Disponibilidade da API e do banco." },
  { name: "Session", description: "Autenticação e controle de sessão." },
  { name: "Users", description: "Usuários da empresa do usuário autenticado." },
  { name: "Roles", description: "Cargos da empresa, os usuários de cada um e o catálogo de permissões." },
  {
    name: "SystemConfigs",
    description:
      "Configurações de sistema da empresa: catálogo definido no código, valores gravados por empresa, em lote.",
  },
  { name: "Upload", description: "Envio de arquivos para o storage." },
];

export const swaggerOptions: FastifyDynamicSwaggerOptions = {
  openapi: {
    openapi: "3.1.0",
    info: {
      title: `${env.PROJECT_NAME} API`,
      description: "Documentação gerada a partir dos schemas Zod das rotas.",
      version: "1.0.0",
    },
    servers: [{ url: `http://localhost:${env.PORT}`, description: "Ambiente local" }],
    tags,
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: SESSION_COOKIE_NAME,
          description: `JWT enviado no cookie HTTP-only \`${SESSION_COOKIE_NAME}\`. Faça login pelo próprio Swagger para testar as rotas protegidas.`,
        },
      },
    },
  },
  transform: jsonSchemaTransform,
  transformObject: jsonSchemaTransformObject,
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

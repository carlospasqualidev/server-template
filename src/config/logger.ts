import { type FastifyRequest, type FastifyServerOptions } from "fastify";

import { type Env, env } from "@/config/env";

/** Cabeçalhos que nunca vão para o log (sessão e credenciais). */
const REDACTED_PATHS = ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'];

/**
 * Texto livre de busca das listas (`?search=`): pode ser um nome ou um e-mail digitado, e fica na query string porque
 * os filtros da lista vivem na URL do frontend. O log de requisição grava a URL; o valor deste parâmetro sai mascarado.
 */
const MASKED_QUERY_PARAMETER = "search";
const MASKED_QUERY_VALUE = "[omitido]";

/** O que o logger lê do ambiente. Os testes passam um ambiente próprio para montar o logger de produção. */
type LoggerEnv = Pick<Env, "isTest" | "isProduction" | "NODE_ENV" | "LOG_LEVEL">;

/**
 * Onde a query começa para o roteador do Fastify 5 (find-my-way): no primeiro `?` ou `#`, o que vier antes
 * (`/users#search=maria` chega à rota como `query.search`). O `;` também separaria, mas o projeto não liga
 * `useSemicolonDelimiter`.
 */
function findQueryStart(url: string): number {
  return url.search(/[?#]/);
}

/**
 * Troca o valor de cada `search` da query por `[omitido]`. O nome é comparado já decodificado (`%73earch` também é
 * `search` para o parser do Fastify); o resto da URL sai exatamente como chegou, sem recodificar.
 */
export function maskSearchInUrl(url: string): string {
  const queryStart = findQueryStart(url);

  if (queryStart === -1) {
    return url;
  }

  const maskedQuery = url
    .slice(queryStart + 1)
    .split("&")
    .map((parameter) => {
      const [name] = new URLSearchParams(parameter).keys();

      if (name !== MASKED_QUERY_PARAMETER) {
        return parameter;
      }

      const separator = parameter.indexOf("=");
      const rawName = separator === -1 ? parameter : parameter.slice(0, separator);

      return `${rawName}=${MASKED_QUERY_VALUE}`;
    })
    .join("&");

  return `${url.slice(0, queryStart + 1)}${maskedQuery}`;
}

/**
 * Mascara a busca de `url` num texto que a repete, como a mensagem de `FST_ERR_BAD_URL`. Troca só a query: o erro do
 * roteador pode citar o caminho sem o esquema e o host de uma URL absoluta, e a query é a mesma nos dois.
 */
export function maskSearchInText(text: string, url: string): string {
  const queryStart = findQueryStart(url);

  if (queryStart === -1) {
    return text;
  }

  const query = url.slice(queryStart);
  const maskedQuery = maskSearchInUrl(url).slice(queryStart);

  return query === maskedQuery ? text : text.replaceAll(query, maskedQuery);
}

/** Os mesmos campos do serializador `req` padrão do Fastify 5 (`lib/logger-pino.js`), com a busca mascarada na URL. */
function serializeRequestForLog(request: FastifyRequest) {
  const version = request.headers["accept-version"];

  return {
    method: request.method,
    url: maskSearchInUrl(request.url),
    version: typeof version === "string" ? version : undefined,
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket.remotePort,
  };
}

/**
 * Logger do Fastify (pino). Silencioso em teste, legível em desenvolvimento (pino-pretty) e JSON em produção.
 */
export function buildLoggerOptions(environment: LoggerEnv = env): FastifyServerOptions["logger"] {
  if (environment.isTest) {
    return false;
  }

  const options = {
    level: environment.LOG_LEVEL ?? (environment.isProduction ? "info" : "debug"),
    redact: REDACTED_PATHS,
    serializers: { req: serializeRequestForLog },
  };

  if (environment.NODE_ENV === "development") {
    return {
      ...options,
      transport: {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
    };
  }

  return options;
}

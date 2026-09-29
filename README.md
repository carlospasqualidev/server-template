# Server Template

API REST em Fastify 5 + Prisma 7 + Zod 4, com sessão por cookie HTTP-only, upload para S3, OpenAPI gerado dos schemas e suíte de integração contra um Postgres descartável. É o backend dos templates irmãos `frontend-template` (web) e `app-template` (mobile).

As convenções para quem desenvolve (humano ou agente) estão em [`CLAUDE.md`](CLAUDE.md). Este README cobre stack, como rodar e a estrutura.

## Stack

- Node 22+ (ESM), TypeScript strict
- Fastify 5 com `fastify-type-provider-zod`: um schema Zod por endpoint gera validação, tipos, serialização e OpenAPI
- Prisma 7 sobre PostgreSQL (driver adapter `pg`)
- Sessão: JWT em cookie HTTP-only (`token`), bcrypt para senha, rate limit no login
- Upload: streaming para AWS S3 (`@aws-sdk/lib-storage`)
- Logs: pino (pretty em dev, JSON em produção)
- Testes: Vitest + `app.inject()` contra o banco `server_template_test`
- Qualidade: ESLint (camadas, imports, segurança), Prettier, Husky + lint-staged, GitHub Actions

## Requisitos

- Node >= 22.12 (`.nvmrc`)
- Docker (para o Postgres do `docker-compose.yml`) ou um PostgreSQL acessível
- Bucket S3 só se for usar upload; sem as variáveis `AWS_*` a rota responde 503

## Começando

```bash
npm install                # instala e gera o client do Prisma (postinstall)
cp .env.example .env       # ajuste JWT_SECRET e DATABASE_URL se necessário
npm run db:up              # Postgres em docker (cria server_template e server_template_test)
npm run db:deploy          # aplica as migrations
npm run db:seed            # admin@admin.com / 123123123
npm run dev                # http://localhost:8080
```

- API: `http://localhost:8080/api`
- Swagger UI: `http://localhost:8080/docs` (JSON em `/docs/json`)
- Health: `GET /health` (processo) e `GET /health/ready` (processo + banco)

Se a porta 5432 já estiver ocupada na sua máquina: `POSTGRES_PORT=5433 npm run db:up` e troque a porta em `DATABASE_URL`. A suíte de testes usa o mesmo servidor do `DATABASE_URL` do `.env`, só trocando o nome do banco para `server_template_test`.

## Scripts

| Script                            | O que faz                                           |
| --------------------------------- | --------------------------------------------------- |
| `npm run dev`                     | API com `tsx` em watch (`.env` carregado pelo Node) |
| `npm run build`                   | Compila para `dist/` (`tsc` + `tsc-alias`)          |
| `npm start`                       | Roda `dist/server.js`                               |
| `npm run lint`                    | ESLint                                              |
| `npm run format`                  | Prettier (escrita)                                  |
| `npm run typecheck`               | `tsc --noEmit`                                      |
| `npm test` / `npm run test:watch` | Vitest (precisa do Postgres no ar)                  |
| `npm run check`                   | Lint + typecheck + test                             |
| `npm run db:up` / `db:down`       | Sobe / derruba o Postgres do compose                |
| `npm run db:migrate -- --name x`  | Cria e aplica uma migration (dev)                   |
| `npm run db:deploy`               | Aplica migrations pendentes (CI / produção)         |
| `npm run db:seed`                 | Popula os dados iniciais                            |
| `npm run db:generate`             | Gera o client do Prisma em `src/generated`          |
| `npm run db:studio`               | Prisma Studio                                       |
| `npm run openapi:export`          | Grava o contrato em `docs/openapi.json`             |
| `npm run clean`                   | Remove `dist/`, `coverage/` e o client gerado       |

## Variáveis de ambiente

Validadas com Zod em `src/config/env.ts` na subida. Obrigatória ausente derruba a API com mensagem clara.

| Variável                                                                           | Obrigatória | Padrão                                        |
| ---------------------------------------------------------------------------------- | ----------- | --------------------------------------------- |
| `DATABASE_URL`                                                                     | sim         |                                               |
| `JWT_SECRET` (mín. 16 caracteres)                                                  | sim         |                                               |
| `PORT`                                                                             | não         | `8080`                                        |
| `NODE_ENV` (`development` / `test` / `production`)                                 | não         | `development`                                 |
| `PROJECT_NAME`                                                                     | não         | `Server`                                      |
| `PROJECT_ENVIRONMENT` (rótulo enviado ao log de erros)                             | não         | valor de `NODE_ENV`                           |
| `LOG_LEVEL`                                                                        | não         | `debug` em dev, `info` em produção            |
| `SESSION_TTL_HOURS`                                                                | não         | `12`                                          |
| `CORS_ORIGINS` (lista separada por vírgula)                                        | não         | `http://localhost:5173,http://localhost:4173` |
| `ERROR_LOG_URL` (POST de erros 500, só em produção)                                | não         |                                               |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_BUCKET_REGION` | não         | sem as quatro, upload responde 503            |

Em produção o cookie de sessão é enviado com `Secure`; use HTTPS.

## Rotas atuais

Prefixo `/api/client`. Rotas protegidas exigem o cookie `token`.

| Método   | Rota                | Protegida | Descrição                                                                     |
| -------- | ------------------- | --------- | ----------------------------------------------------------------------------- |
| `POST`   | `/session/login`    | não       | Autentica e grava o cookie                                                    |
| `POST`   | `/session/register` | não       | Cria empresa + usuário e inicia a sessão                                      |
| `POST`   | `/session/logout`   | não       | Limpa o cookie                                                                |
| `GET`    | `/users/me`         | sim       | Usuário da sessão                                                             |
| `GET`    | `/users`            | sim       | Lista paginada (`page`, `pageSize`, `orderBy`, `order`, `search`, `isActive`) |
| `GET`    | `/users/:userId`    | sim       | Busca por id (mesma empresa)                                                  |
| `POST`   | `/users`            | sim       | Cria usuário na empresa                                                       |
| `PATCH`  | `/users/:userId`    | sim       | Atualização parcial                                                           |
| `DELETE` | `/users/:userId`    | sim       | Exclusão lógica                                                               |
| `POST`   | `/upload/file`      | sim       | Envia um arquivo (campo `file`) para o S3                                     |

Formato de erro: `{ message, details?, issues? }`. Erro de validação traz `issues: [{ path, message }]`. O contrato completo, gerado dos schemas, fica em [`docs/openapi.json`](docs/openapi.json).

## Estrutura

```
src/
  app.ts            monta a aplicação (plugins, Zod, error handler, rotas)
  server.ts         listen + graceful shutdown
  routes.ts         /api → /client → módulos (grupo protegido por requireSession)
  config/           env (Zod), constants, cors, logger, swagger
  hooks/            requireSession
  lib/              prisma, errors, http (paginação/respostas), validation, auth, storage, format
  modules/
    health/         liveness e readiness
    session/        login, register, logout
    users/          CRUD de referência (paginação, busca, allowlist de ordenação, tenant, soft delete)
    upload/         arquivo → S3
  tests/            suíte de integração (helpers, factories, setup do banco)
prisma/             schema, migrations, seed
docs/openapi.json   contrato exportado
```

Cada módulo segue `routes → controllers → services → prisma`, com um arquivo por endpoint em `schemas/`, `controllers/` e `services/`. O passo a passo para criar um endpoint novo está em [`CLAUDE.md`](CLAUDE.md#anatomia-de-um-endpoint--checklist-para-criar-um-novo).

## Testes

A suíte é de integração real: sobe a aplicação com `app.inject()` (sem porta) e fala com o Postgres `server_template_test`, criado pelo compose (ou pelo `globalSetup`, se faltar). Cada teste começa com as tabelas truncadas; o S3 é mockado.

```bash
npm run db:up
npm test
```

O banco de teste é derivado do `DATABASE_URL` do `.env` (mesmo servidor e credenciais, banco `server_template_test`), então basta o `.env` estar certo para `npm test` e o hook de `pre-push` funcionarem. Para apontar outro servidor, `TEST_DATABASE_URL=postgresql://... npm test` (é o que o CI faz). Por segurança o nome do banco precisa terminar em `_test`.

## Docker e produção

- `Dockerfile` multi-stage: compila em `node:22-slim`, roda `dist/server.js` só com dependências de produção.
- Migrations rodam fora da imagem: `npx prisma migrate deploy` no pipeline, antes de subir a nova versão.
- Health checks para o orquestrador: `/health` (liveness) e `/health/ready` (readiness).
- O processo encerra com `SIGTERM` fechando conexões (graceful shutdown).

## Swagger

1. Abra `http://localhost:8080/docs`.
2. Em **Session**, execute `POST /api/client/session/login` com `admin@admin.com` / `123123123`.
3. O cookie fica no navegador; as rotas de **Users** e **Upload** passam a funcionar na mesma aba.

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
npm run db:seed            # catálogo de permissões + admin@admin.com / 123123123 (Administrador)
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
| `npm run db:seed`                 | Sincroniza as permissões e popula os dados iniciais |
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

Prefixo `/api/client`. Rotas protegidas exigem o cookie `token`; as que têm permissão respondem 403 sem ela.

| Método   | Rota                      | Protegida | Permissão                                             | Descrição                                                                                                          |
| -------- | ------------------------- | --------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/session/login`          | não       |                                                       | Autentica e grava o cookie                                                                                         |
| `POST`   | `/session/register`       | não       |                                                       | Cria empresa, cargo Administrador e usuário, e inicia a sessão                                                     |
| `POST`   | `/session/logout`         | não       |                                                       | Limpa o cookie                                                                                                     |
| `GET`    | `/users/me`               | sim       |                                                       | Usuário da sessão, com `permissions` e `idleTimeoutMinutes`                                                        |
| `GET`    | `/users`                  | sim       | `backoffice.users.read`                               | Lista paginada com cargos e último acesso (`page`, `pageSize`, `orderBy`, `order`, `search`, `isActive`, `roleId`) |
| `GET`    | `/users/:userId`          | sim       | `backoffice.users.read`                               | Busca por id (mesma empresa), com cargos e último acesso                                                           |
| `POST`   | `/users`                  | sim       | `backoffice.users.create`                             | Cria usuário na empresa                                                                                            |
| `PATCH`  | `/users/:userId`          | sim       | `backoffice.users.update`                             | Atualização parcial                                                                                                |
| `DELETE` | `/users/:userId`          | sim       | `backoffice.users.delete`                             | Exclusão lógica                                                                                                    |
| `PUT`    | `/users/:userId/roles`    | sim       | `backoffice.users.update`                             | Define os cargos do usuário                                                                                        |
| `GET`    | `/roles/permissions`      | sim       | `backoffice.roles.read`                               | Catálogo de permissões agrupado (módulo → grupo → permissões)                                                      |
| `GET`    | `/roles`                  | sim       | `backoffice.roles.read`                               | Lista paginada de cargos (`page`, `pageSize`, `orderBy`, `order`, `search`)                                        |
| `GET`    | `/roles/:roleId`          | sim       | `backoffice.roles.read`                               | Cargo com as permissões                                                                                            |
| `POST`   | `/roles`                  | sim       | `backoffice.roles.create`                             | Cria cargo                                                                                                         |
| `POST`   | `/roles/:roleId/copy`     | sim       | `backoffice.roles.create`                             | Copia cargo (permissões e descrição, sem usuários)                                                                 |
| `PUT`    | `/roles/:roleId`          | sim       | `backoffice.roles.update`                             | Edita nome, descrição e o conjunto de permissões                                                                   |
| `DELETE` | `/roles/:roleId`          | sim       | `backoffice.roles.delete`                             | Exclusão lógica (cargo sem usuários)                                                                               |
| `GET`    | `/roles/:roleId/users`    | sim       | `backoffice.roles.read` e `backoffice.users.read`     | Usuários do cargo, paginado                                                                                        |
| `PUT`    | `/roles/:roleId/users`    | sim       | `backoffice.roles.update` e `backoffice.users.update` | Define os usuários do cargo                                                                                        |
| `GET`    | `/system-configs`         | sim       | `backoffice.systemConfigs.read`                       | Configurações da empresa (catálogo inteiro, valor gravado ou padrão)                                               |
| `PATCH`  | `/system-configs`         | sim       | `backoffice.systemConfigs.update`                     | Grava configurações em lote (`{ items: [{ key, value }] }`), tudo ou nada                                          |
| `GET`    | `/audit-logs`             | sim       | `backoffice.audit.read`                               | Trilha de auditoria paginada (filtros, período, busca, ordenação)                                                  |
| `GET`    | `/audit-logs/options`     | sim       | `backoffice.audit.read`                               | Módulos, ações e entidades da trilha, com rótulo pt-BR                                                             |
| `GET`    | `/audit-logs/:auditLogId` | sim       | `backoffice.audit.read`                               | Registro da trilha com antes, depois e autor                                                                       |
| `POST`   | `/upload/file`            | sim       |                                                       | Envia um arquivo (campo `file`) para o S3                                                                          |

Formato de erro: `{ message, details?, issues? }`. Erro de validação traz `issues: [{ path, message }]`. O contrato completo, gerado dos schemas, fica em [`docs/openapi.json`](docs/openapi.json).

## Permissões

Controle de acesso por cargo: o catálogo de permissões (`src/modules/permissions/permission.catalog.ts`) é global; os cargos são de cada empresa. Toda empresa nasce com o cargo `Administrador`, que tem o catálogo inteiro. As permissões efetivas do usuário (união dos seus cargos) vêm em `user.permissions` no login, no register e em `/users/me`, e são relidas do banco a cada requisição. O catálogo chega ao banco por uma sincronização idempotente que roda na subida do servidor (antes de aceitar requisição), no `npm run db:seed` e antes de cada teste; várias instâncias subindo juntas se revezam por uma trava no banco. Em produção ela exige o schema em dia: rode `npx prisma migrate deploy` antes de subir a versão nova, ou a subida falha com `Falha ao sincronizar o catálogo de permissões`. O register espera uma sincronização em andamento antes de criar o `Administrador` da empresa nova, para ele nascer com o catálogo completo.

Os cargos são geridos pelas rotas `/roles`: cada cargo recebe permissões do catálogo (qualquer escrita de um grupo inclui a leitura do mesmo grupo) e usuários. O cargo `Administrador` não é editado, excluído nem copiado; a empresa nunca fica sem um administrador ativo; ninguém altera os próprios cargos; e ninguém concede a um cargo, ou atribui a alguém, permissão que não possui (o `Administrador` só é dado ou tirado por outro administrador). Regras, passo a passo para uma permissão nova e a gestão de cargos: [`CLAUDE.md`](CLAUDE.md#permissões-e-cargos).

## Sessão e timeout de inatividade

Login, register e `GET /users/me` devolvem `user = { id, name, email, image, permissions, idleTimeoutMinutes }`. `idleTimeoutMinutes` chega já resolvido: o tempo do cadastro do usuário (`POST /users` e `PATCH /users/:userId` aceitam de 1 a 480, ou `null` para herdar), senão a configuração `security.idleTimeoutMinutes` da empresa, senão 20. Quem encerra a sessão por inatividade é o cliente; o servidor não impõe o tempo (o cookie vale até `SESSION_TTL_HOURS`).

## Usuários

O usuário do CRUD (`/users`) traz, além do cadastro, os cargos que valem (`roles: [{ id, name }]`, por nome) e o último acesso (`lastLoginAt`, `null` para quem nunca acessou), gravado a cada abertura de sessão (login bem-sucedido ou register) junto do registro de auditoria, sem mexer no `updatedAt`, que reflete só edição de cadastro. Não há campo de status: ativo ou bloqueado é `isActive`. A lista filtra por cargo (`roleId=<id>,<id>`, qualquer um deles) e ordena por último acesso com quem nunca acessou no fim. Contrato completo: [`CLAUDE.md`](CLAUDE.md#contrato-com-os-clientes-frontend-web-e-app).

## Configurações de sistema

Cada empresa ajusta as configurações numa tela única. As definições (rótulo, tipo, padrão e regra de validação) ficam no código, em `src/modules/systemConfigs/systemConfig.catalog.ts`; o banco guarda só os valores que a empresa gravou, e o que não foi gravado vale o padrão. `value` trafega sempre como texto. A gravação é em lote e atômica: um item inválido responde 400 e nada é gravado. Chaves iniciais: `app.name`, `app.supportEmail`, `security.idleTimeoutMinutes` (padrão 20, de 1 a 480) e `notifications.email`. Como acrescentar uma chave: [`CLAUDE.md`](CLAUDE.md#configurações-de-sistema).

## Trilha de auditoria

Toda mudança relevante numa empresa (usuários, cargos, vínculos entre eles, configurações) e todo login ficam registrados com autor, antes e depois, gravados na mesma transação da mudança: se ela falha, nada é registrado. Quem tem `backoffice.audit.read` consulta a trilha da própria empresa em `/audit-logs`, com filtros por módulo, entidade, ação, autor, registro e período, busca e detalhe. A trilha não guarda senha nem hash, e troca por `[omitido]` o valor de dado pessoal (nome, e-mail, telefone e foto do usuário, e-mail de suporte); o nome do autor vem do cadastro. IP e user-agent da requisição são gravados, mas não saem pela API. Como instrumentar uma mutação nova: [`CLAUDE.md`](CLAUDE.md#trilha-de-auditoria).

## Estrutura

```
src/
  app.ts            monta a aplicação (plugins, Zod, error handler, rotas)
  server.ts         sincroniza o catálogo de permissões, listen + graceful shutdown
  routes.ts         /api → /client → módulos (grupo protegido por requireSession)
  config/           env (Zod), constants, cors, logger, swagger
  hooks/            requireSession, requirePermission
  lib/              prisma, errors, http (paginação/respostas), validation, auth, audit (contexto e antes/depois), storage, format
  modules/
    health/         liveness e readiness
    session/        login, register, logout
    users/          CRUD de referência (paginação, busca, allowlist de ordenação, tenant, soft delete)
    upload/         arquivo → S3
    permissions/    catálogo de permissões, sincronização, cargo Administrador, permissões efetivas
    roles/          gestão de cargos: catálogo agrupado, CRUD, cópia, usuários do cargo
    systemConfigs/  configurações por empresa: catálogo no código, leitura, gravação em lote, timeout de inatividade
    audit/          trilha de auditoria: gravação nas mutações, lista, detalhe e opções de filtro
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
- Migrations rodam fora da imagem: `npx prisma migrate deploy` no pipeline, antes de subir a nova versão. A subida depende disso: antes do `listen` o servidor sincroniza o catálogo de permissões e, se falhar, encerra com erro.
- Health checks para o orquestrador: `/health` (liveness) e `/health/ready` (readiness).
- O processo encerra com `SIGTERM` fechando conexões (graceful shutdown).

## Swagger

1. Abra `http://localhost:8080/docs`.
2. Em **Session**, execute `POST /api/client/session/login` com `admin@admin.com` / `123123123`.
3. O cookie fica no navegador; as rotas de **Users** e **Upload** passam a funcionar na mesma aba.

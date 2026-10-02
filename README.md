# Server Template

API REST em Fastify 5 + Prisma 7 + Zod 4, com sessão por cookie HTTP-only na web e por `Authorization: Bearer` no app nativo, upload para S3, OpenAPI gerado dos schemas e suíte de integração contra um Postgres descartável. É o backend dos templates irmãos `frontend-template` (web) e `app-template` (mobile).

As convenções para quem desenvolve (humano ou agente) estão em [`CLAUDE.md`](CLAUDE.md). Este README cobre stack, como rodar e a estrutura.

## Stack

- Node 22+ (ESM), TypeScript strict
- Fastify 5 com `fastify-type-provider-zod`: um schema Zod por endpoint gera validação, tipos, serialização e OpenAPI
- Prisma 7 sobre PostgreSQL (driver adapter `pg`)
- Sessão: JWT em cookie HTTP-only (`token`) para a web, ou em `Authorization: Bearer` para o app nativo, bcrypt para senha, rate limit no login e na troca da própria senha
- Upload: streaming para AWS S3 (`@aws-sdk/lib-storage`)
- Logs: pino (pretty em dev, JSON em produção)
- Testes: Vitest + `app.inject()` contra um Postgres local, num banco temporário por execução
- Qualidade: ESLint (camadas, imports, segurança), Prettier, Husky + lint-staged, GitHub Actions

## Requisitos

- Node >= 22.12 (`.nvmrc`)
- Docker (para o Postgres do `docker-compose.yml`) ou um PostgreSQL acessível
- Bucket S3 só se for usar upload; sem as variáveis `AWS_*` a rota responde 503

## Começando

```bash
npm install                # instala e gera o client do Prisma (postinstall)
cp .env.example .env       # ajuste JWT_SECRET e DATABASE_URL se necessário
npm run db:up              # Postgres em docker (cria server_template)
npm run db:deploy          # aplica as migrations
npm run db:seed            # catálogo de permissões + admin@admin.com / 123123123 (Administrador)
npm run dev                # http://localhost:8080
```

- API: `http://localhost:8080/api`
- Swagger UI: `http://localhost:8080/docs` (JSON em `/docs/json`)
- Health: `GET /health` (processo) e `GET /health/ready` (processo + banco)

Se a porta 5432 já estiver ocupada na sua máquina: `POSTGRES_PORT=5433 npm run db:up` e troque a porta em `DATABASE_URL`. A suíte de testes usa o mesmo servidor do `DATABASE_URL` do `.env`, num banco temporário próprio.

## Scripts

| Script                            | O que faz                                           |
| --------------------------------- | --------------------------------------------------- |
| `npm run dev`                     | API com `tsx` em watch (`.env` carregado pelo Node) |
| `npm run build`                   | Compila para `dist/` (`tsc` + `tsc-alias`)          |
| `npm start`                       | Roda `dist/server.js`                               |
| `npm run lint`                    | ESLint                                              |
| `npm run format`                  | Prettier (escrita)                                  |
| `npm run format:check`            | Prettier (só confere)                               |
| `npm run typecheck`               | `tsc --noEmit`                                      |
| `npm test` / `npm run test:watch` | Vitest (precisa do Postgres no ar)                  |
| `npm run check`                   | Lint + format:check + typecheck + test              |
| `npm run db:up` / `db:down`       | Sobe / derruba o Postgres do compose                |
| `npm run db:migrate -- --name x`  | Cria e aplica uma migration (dev)                   |
| `npm run db:deploy`               | Aplica migrations pendentes (CI / produção)         |
| `npm run db:seed`                 | Sincroniza as permissões e popula os dados iniciais |
| `npm run db:generate`             | Gera o client do Prisma em `src/generated`          |
| `npm run db:studio`               | Prisma Studio                                       |
| `npm run openapi:export`          | Grava o contrato em `docs/openapi.json`             |
| `npm run audit:retention`         | Roda uma vez a retenção da trilha de auditoria      |
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
| `CORS_ORIGINS` (lista separada por vírgula; `*` é recusado)                        | não         | `http://localhost:5173,http://localhost:4173` |
| `ERROR_LOG_URL` (POST de erros 500, só em produção)                                | não         |                                               |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_BUCKET_REGION` | não         | sem as quatro, upload responde 503            |
| `AUDIT_RETENTION_ENABLED` (`true` / `false`: retenção diária da auditoria)         | não         | `true` (sempre desligada em teste)            |

Em produção o cookie de sessão é enviado com `Secure`; use HTTPS.

## Rotas atuais

Prefixo `/api/client`. Rotas protegidas exigem o cookie `token` (web) ou o cabeçalho `Authorization: Bearer <token>` (app nativo; com os dois, vale o cabeçalho); as que têm permissão respondem 403 sem ela.

| Método   | Rota                                     | Protegida | Permissão                                             | Descrição                                                                                                          |
| -------- | ---------------------------------------- | --------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/session/login`                         | não       |                                                       | Autentica e grava o cookie (com `X-Client-Type: mobile`, devolve o `token` no corpo, sem cookie)                   |
| `POST`   | `/session/register`                      | não       |                                                       | Cria empresa, cargo Administrador e usuário, e inicia a sessão                                                     |
| `POST`   | `/session/logout`                        | não       |                                                       | Limpa o cookie (o token Bearer não é revogado: o app o descarta)                                                   |
| `GET`    | `/users/me`                              | sim       |                                                       | Usuário da sessão, com `permissions` e `idleTimeoutMinutes`                                                        |
| `GET`    | `/users/me/profile`                      | sim       |                                                       | Perfil gravado do próprio usuário (tempo de inatividade próprio, não o resolvido)                                  |
| `PATCH`  | `/users/me`                              | sim       |                                                       | Edita o próprio perfil (nome, telefone, foto, tempo de inatividade)                                                |
| `PUT`    | `/users/me/password`                     | sim       |                                                       | Troca a própria senha, com a senha atual (mesmo limite de tentativas do login)                                     |
| `GET`    | `/users`                                 | sim       | `backoffice.users.read`                               | Lista paginada com cargos e o último acesso (filtros: `search`, `isActive`, `roleId`, `createdFrom` e `createdTo`) |
| `GET`    | `/users/:userId`                         | sim       | `backoffice.users.read`                               | Busca por id (mesma empresa), com cargos e último acesso                                                           |
| `POST`   | `/users`                                 | sim       | `backoffice.users.create`                             | Cria usuário na empresa                                                                                            |
| `PATCH`  | `/users/:userId`                         | sim       | `backoffice.users.update`                             | Atualização parcial                                                                                                |
| `DELETE` | `/users/:userId`                         | sim       | `backoffice.users.delete`                             | Exclusão lógica                                                                                                    |
| `PUT`    | `/users/:userId/roles`                   | sim       | `backoffice.users.update`                             | Define os cargos do usuário                                                                                        |
| `GET`    | `/roles/permissions`                     | sim       | `backoffice.roles.read`                               | Catálogo de permissões agrupado (módulo → grupo → permissões)                                                      |
| `GET`    | `/roles`                                 | sim       | `backoffice.roles.read`                               | Lista paginada de cargos (`page`, `pageSize`, `orderBy`, `order`, `search`)                                        |
| `GET`    | `/roles/:roleId`                         | sim       | `backoffice.roles.read`                               | Cargo com as permissões                                                                                            |
| `POST`   | `/roles`                                 | sim       | `backoffice.roles.create`                             | Cria cargo                                                                                                         |
| `POST`   | `/roles/:roleId/copy`                    | sim       | `backoffice.roles.create`                             | Copia cargo (permissões e descrição, sem usuários)                                                                 |
| `PUT`    | `/roles/:roleId`                         | sim       | `backoffice.roles.update`                             | Edita nome, descrição e o conjunto de permissões                                                                   |
| `DELETE` | `/roles/:roleId`                         | sim       | `backoffice.roles.delete`                             | Exclusão lógica (cargo sem usuários)                                                                               |
| `GET`    | `/roles/:roleId/users`                   | sim       | `backoffice.roles.read` e `backoffice.users.read`     | Usuários do cargo, paginado                                                                                        |
| `PUT`    | `/roles/:roleId/users`                   | sim       | `backoffice.roles.update` e `backoffice.users.update` | Define os usuários do cargo                                                                                        |
| `GET`    | `/system-configs`                        | sim       | `backoffice.systemConfigs.read`                       | Configurações da empresa (catálogo inteiro, valor gravado ou padrão)                                               |
| `PATCH`  | `/system-configs`                        | sim       | `backoffice.systemConfigs.update`                     | Grava configurações em lote (`{ items: [{ key, value }] }`), tudo ou nada                                          |
| `GET`    | `/audit-logs`                            | sim       | `backoffice.audit.read`                               | Trilha de auditoria paginada (filtros, período, busca por conteúdo, ordenação)                                     |
| `GET`    | `/audit-logs/options`                    | sim       | `backoffice.audit.read`                               | Módulos, ações e entidades da trilha, com rótulo pt-BR                                                             |
| `GET`    | `/audit-logs/entities/:entity/:entityId` | sim       | `backoffice.audit.read`                               | Linha do tempo de um registro (usuário, cargo, configuração), paginada, com o de→para legível de cada evento       |
| `GET`    | `/audit-logs/:auditLogId`                | sim       | `backoffice.audit.read`                               | Registro da trilha com antes, depois, autor e o de→para legível (`fieldChanges`)                                   |
| `POST`   | `/upload/file`                           | sim       |                                                       | Envia um arquivo (campo `file`) para o S3                                                                          |

Formato de erro: `{ message, details?, issues? }`. Erro de validação traz `issues: [{ path, message }]`. O contrato completo, gerado dos schemas, fica em [`docs/openapi.json`](docs/openapi.json).

## Permissões

Controle de acesso por cargo: o catálogo de permissões (`src/modules/permissions/permission.catalog.ts`) é global; os cargos são de cada empresa. Toda empresa nasce com o cargo `Administrador`, que tem o catálogo inteiro. As permissões efetivas do usuário (união dos seus cargos) vêm em `user.permissions` no login, no register e em `/users/me`, e são relidas do banco a cada requisição. O catálogo chega ao banco por uma sincronização idempotente que roda na subida do servidor (antes de aceitar requisição), no `npm run db:seed` e antes de cada teste; várias instâncias subindo juntas se revezam por uma trava no banco. Em produção ela exige o schema em dia: rode `npx prisma migrate deploy` antes de subir a versão nova, ou a subida falha com `Falha ao sincronizar o catálogo de permissões`. O register espera uma sincronização em andamento antes de criar o `Administrador` da empresa nova, para ele nascer com o catálogo completo.

Os cargos são geridos pelas rotas `/roles`: cada cargo recebe permissões do catálogo (qualquer escrita de um grupo inclui a leitura do mesmo grupo) e usuários. O cargo `Administrador` não é editado, excluído nem copiado; a empresa nunca fica sem um administrador ativo; ninguém altera os próprios cargos; e ninguém concede a um cargo, ou atribui a alguém, permissão que não possui (o `Administrador` só é dado ou tirado por outro administrador). Regras, passo a passo para uma permissão nova e a gestão de cargos: [`CLAUDE.md`](CLAUDE.md#permissões-e-cargos).

## Sessão e timeout de inatividade

Login, register e `GET /users/me` devolvem `user = { id, name, email, image, permissions, idleTimeoutMinutes }`. `idleTimeoutMinutes` chega já resolvido: o tempo do cadastro do usuário (`POST /users` e `PATCH /users/:userId` aceitam de 1 a 480, ou `null` para herdar; o próprio usuário, em `PATCH /users/me`, só até o da empresa), senão a configuração `security.idleTimeoutMinutes` da empresa, senão 20. Quem encerra a sessão por inatividade é o cliente; o servidor não impõe o tempo (o cookie ou o token vale até `SESSION_TTL_HOURS`).

O mesmo JWT chega ao cliente de dois jeitos. A web não manda nada de especial: login e register gravam o cookie HTTP-only e respondem `{ success, user }`, sem o token. O app nativo manda o cabeçalho `X-Client-Type: mobile` (único valor aceito; outro responde 400): a resposta traz também `token`, e o cookie não é gravado, para a credencial ficar só no armazenamento seguro do aparelho (o pote de cookies do sistema guardaria uma cópia fora dele, que ainda abriria a sessão depois do logout). O app envia o token em `Authorization: Bearer <token>`; com o cabeçalho e o cookie na mesma requisição, vale o cabeçalho. Não há refresh nem revogação: o token vale até `SESSION_TTL_HOURS`, e no logout o app o apaga. Rate limit, registro `login` na auditoria e `lastLoginAt` são iguais nos dois modos.

## Usuários

O usuário do CRUD (`/users`) traz, além do cadastro, os cargos que valem (`roles: [{ id, name }]`, por nome) e o último acesso (`lastLoginAt`, `null` para quem nunca acessou), gravado a cada abertura de sessão (login bem-sucedido ou register) junto do registro de auditoria, sem mexer no `updatedAt`, que reflete só edição de cadastro. Não há campo de status: ativo ou bloqueado é `isActive`. A lista filtra por cargo (`roleId=<id>,<id>`, qualquer um deles) e por período de cadastro (`createdFrom`/`createdTo`, ISO 8601 UTC, inclusivos), e ordena por último acesso, com quem nunca acessou no fim, ou por status (`orderBy=isActive`: no `asc` os bloqueados vêm antes dos ativos).

Qualquer usuário logado, sem permissão de administrar usuários, lê o próprio perfil em `GET /users/me/profile` (os valores gravados: ali o tempo de inatividade é o próprio, `null` quando herda o da empresa, e não o resolvido da sessão), edita-o em `PATCH /users/me` (nome, telefone, foto `https` e tempo de inatividade até o da empresa; e-mail, status e cargos não mudam por aqui) e troca a própria senha em `PUT /users/me/password`, informando a senha atual (se a senha mudar por outro caminho no meio da troca, responde 409 e nada é gravado). As duas mudanças entram na trilha de auditoria com o próprio usuário como autor (a senha só como campo alterado, sem valor). A troca de senha não encerra as sessões abertas: sem tabela de sessões, o cookie ou o token já emitido vale até expirar (`SESSION_TTL_HOURS`). Contrato completo: [`CLAUDE.md`](CLAUDE.md#contrato-com-os-clientes-frontend-web-e-app).

## Configurações de sistema

Cada empresa ajusta as configurações numa tela única. As definições (rótulo, tipo, padrão e regra de validação) ficam no código, em `src/modules/systemConfigs/systemConfig.catalog.ts`; o banco guarda só os valores que a empresa gravou, e o que não foi gravado vale o padrão. `value` trafega sempre como texto. A gravação é em lote e atômica: um item inválido responde 400 e nada é gravado. Chaves iniciais: `app.name`, `app.supportEmail`, `security.idleTimeoutMinutes` (padrão 20, de 1 a 480), `audit.anonymizeAfterMonths` (padrão 12, de 1 a 120), `audit.deleteAfterMonths` (padrão 60, de 2 a 240, sempre maior que o anterior) e `notifications.email`. Como acrescentar uma chave: [`CLAUDE.md`](CLAUDE.md#configurações-de-sistema).

## Trilha de auditoria

Toda mudança relevante numa empresa (usuários, cargos, vínculos entre eles, configurações), todo login e toda exportação ficam registrados com autor, os valores antes e depois e uma frase que nomeia o registro (`Editou o usuário "Maria Alves".`), gravados na mesma transação da mudança: se ela falha, nada é registrado. Quem tem `backoffice.audit.read` consulta a trilha da própria empresa em `/audit-logs`, com filtros por módulo, entidade, ação, autor, registro e período, detalhe, busca por conteúdo, que acha um evento por qualquer valor gravado (um e-mail, um nome antigo), e a linha do tempo de um registro (`/audit-logs/entities/User/<id>`: tudo o que aconteceu com ele). O detalhe e a linha do tempo trazem o que mudou em português, pronto para exibir: `Nome: Maria → Maria Alves`, `Ativo: Sim → Não`, com datas, números e vazios formatados pelo servidor (rótulos de campo por entidade, no catálogo do módulo). A trilha guarda dado pessoal (nome, e-mail, telefone e foto do usuário) por decisão do projeto, com finalidade de segurança e prestação de contas, e por prazo: cada empresa define nas configurações quando o evento é anonimizado (padrão 12 meses: some o autor, o IP, o user-agent e os dados pessoais, e a frase perde o nome, mas continua se sabendo o que mudou) e quando é apagado (padrão 60 meses). Nunca guarda senha, hash ou valor de configuração secreta; o nome do autor vem do cadastro. IP e user-agent da requisição são gravados, mas não saem pela API. Rota de exportação nova grava a exportação com formato e filtros. Como instrumentar uma mutação ou uma exportação: [`CLAUDE.md`](CLAUDE.md#trilha-de-auditoria).

A retenção roda todo dia às 03:00 UTC dentro do próprio servidor (toda instância agenda; uma trava no banco deixa uma só trabalhar) e, sob demanda, por `npm run audit:retention` (na imagem de produção, `node dist/scripts/runAuditRetention.js`), para quem prefere um cron externo com `AUDIT_RETENTION_ENABLED=false`. Cada execução trabalha por até 55 minutos e para entre dois lotes; a seguinte continua de onde ela parou. No encerramento do servidor, a execução em curso termina o lote antes de o banco ser desconectado. Pedido de eliminação de um titular: `anonymizeAuditForUserService({ companyId, userId })` anonimiza na hora os eventos em que ele é autor ou alvo (sem rota; ver [`CLAUDE.md`](CLAUDE.md#trilha-de-auditoria)).

> **Adotando o template num projeto que já tem histórico de auditoria?** A retenção vem ligada por padrão, e a primeira execução anonimiza os eventos com mais de 12 meses e apaga os com mais de 60 (ou pelos prazos que cada empresa tiver gravado), de forma **irreversível**. Suba com `AUDIT_RETENTION_ENABLED=false`, ajuste os prazos nas configurações de cada empresa (`audit.anonymizeAfterMonths` e `audit.deleteAfterMonths`) e só então ligue a retenção.

A busca usa índices trigram do Postgres: a migration `20260929234145_audit_logs_content_search` instala a extensão `pg_trgm` (`CREATE EXTENSION IF NOT EXISTS`). Ela vem no Postgres oficial e é confiável desde o 13 (o dono do banco a instala sem superusuário); num Postgres gerenciado, confirme que ela está liberada antes do `migrate deploy`.

## Estrutura

```
src/
  app.ts            monta a aplicação (plugins, Zod, error handler, rotas)
  server.ts         sincroniza o catálogo de permissões, agenda a retenção da auditoria, listen + graceful shutdown
  routes.ts         /api → /client → módulos (grupo protegido por requireSession)
  config/           env (Zod), constants, cors, logger, swagger
  hooks/            requireSession, requirePermission
  lib/              prisma, errors, http (paginação/respostas), validation, auth, audit (contexto, antes/depois, corte da retenção), jobs (agendamento diário), storage, format
  modules/
    health/         liveness e readiness
    session/        login, register, logout
    users/          CRUD de referência (paginação, busca, allowlist de ordenação, tenant, soft delete)
    upload/         arquivo → S3
    permissions/    catálogo de permissões, sincronização, cargo Administrador, permissões efetivas
    roles/          gestão de cargos: catálogo agrupado, CRUD, cópia, usuários do cargo
    systemConfigs/  configurações por empresa: catálogo no código, leitura, gravação em lote, timeout de inatividade
    audit/          trilha de auditoria: gravação nas mutações e exportações, frases, lista com busca, detalhe, opções e retenção
  scripts/          linha de comando compilada com a app (retenção da auditoria sob demanda)
  tests/            suíte de integração (helpers, factories, setup do banco)
prisma/             schema, migrations, seed
docs/openapi.json   contrato exportado
```

Cada módulo segue `routes → controllers → services → prisma`, com um arquivo por endpoint em `schemas/`, `controllers/` e `services/`. O passo a passo para criar um endpoint novo está em [`CLAUDE.md`](CLAUDE.md#anatomia-de-um-endpoint--checklist-para-criar-um-novo).

## Testes

A suíte é de integração real: sobe a aplicação com `app.inject()` (sem porta) e fala com um banco temporário `temporary-int-<carimbo>-<aleatório>`, criado e migrado pelo `globalSetup` e apagado no fim da execução, verde ou vermelha. Cada teste começa com as tabelas truncadas; o S3 é mockado.

```bash
npm run db:up
npm test
```

O servidor vem do `DATABASE_URL` do `.env` (mesmo servidor e credenciais), então basta o `.env` estar certo para `npm test` e o hook de `pre-push` funcionarem. Para outro servidor, `TEST_DATABASE_URL=postgresql://... npm test` (é o que o CI faz); o nome do banco da URL é ignorado.

Só Postgres local: host fora de `localhost`, `127.0.0.1` e `::1` faz a suíte recusar rodar, sem flag de escape. Um `.env` apontando para um banco remoto é ignorado com aviso, e a suíte usa `localhost:5432`. Cada execução tem seu banco, então duas `npm test` simultâneas (outro worktree, o e2e do frontend) não colidem; bancos `temporary-int-*` com mais de 6 h, de execuções interrompidas, são apagados na próxima.

## Docker e produção

- `Dockerfile` multi-stage: compila em `node:22-slim`; a imagem padrão (`docker build .`, estágio `runtime`) roda `dist/server.js` só com dependências de produção, sem o CLI do Prisma, o TypeScript nem outra ferramenta de build. Por isso ela não roda migration.
- Migrations rodam no pipeline, antes de subir a nova versão, por uma de duas vias:
  - a imagem de migração do mesmo commit (estágio `migrate`: o de build, com o CLI do Prisma, o schema e as migrations), que roda `prisma migrate deploy` e sai:
    ```bash
    docker build --target migrate -t server-template-migrate .
    docker run --rm -e DATABASE_URL="postgresql://..." server-template-migrate
    ```
  - ou o runner do CI, no checkout do repositório: `npm ci` e `npx prisma migrate deploy`, com `DATABASE_URL` no ambiente.
- A subida depende das migrations: antes do `listen` o servidor sincroniza o catálogo de permissões (na própria imagem de runtime, sem passo à parte) e, se falhar, encerra com erro. O usuário do banco precisa poder criar a extensão `pg_trgm` (ver **Trilha de auditoria**).
- O runtime instala com `--omit=dev --omit=optional` (o motivo está no `Dockerfile`). Dependência nova que traga o binário nativo como opcional (o `sharp`, por exemplo) fica sem ele nessa imagem: suba o container e confira antes do deploy.
- Health checks para o orquestrador: `/health` (liveness) e `/health/ready` (readiness).
- Retenção da trilha de auditoria: agendada pelo próprio servidor (03:00 UTC). Com cron externo, desligue-a (`AUDIT_RETENTION_ENABLED=false`) e rode na mesma imagem `node dist/scripts/runAuditRetention.js` (mesmas variáveis do servidor; sai com código 1 se falhar).
- O processo encerra com `SIGTERM` fechando conexões (graceful shutdown); uma retenção em curso termina o lote atual antes (até 5 s).

## Swagger

1. Abra `http://localhost:8080/docs`.
2. Em **Session**, execute `POST /api/client/session/login` com `admin@admin.com` / `123123123`.
3. O cookie fica no navegador; as rotas de **Users** e **Upload** passam a funcionar na mesma aba.
4. Para testar como o app nativo: faça o login com o cabeçalho `x-client-type` = `mobile`, copie o `token` da resposta e cole em **Authorize → bearerAuth**.

# CLAUDE.md

Guia para o Claude trabalhar neste backend. Este arquivo é a fonte de verdade para convenções e comportamento esperado — leia o [`README.md`](README.md) para stack, scripts, variáveis de ambiente e como rodar.

> Os templates irmãos `../frontend-template` (web) e `../app-template` (mobile) consomem esta API. O que eles esperam está na seção **Contrato com os clientes**. Não mude formato de resposta, nome de rota ou de campo sem atualizar o consumidor.

---

## Stack

Node 22+ (ESM) • Fastify 5 • TypeScript strict • Zod 4 + `fastify-type-provider-zod` (um schema gera validação, tipo, serialização e OpenAPI) • Prisma 7 (PostgreSQL via driver adapter `pg`) • JWT em cookie HTTP-only • Swagger UI • bcrypt • AWS S3 (upload em stream) • pino • Vitest (integração com Postgres descartável) • ESLint + Prettier + Husky + lint-staged • Docker Compose (Postgres).

---

## Comportamento esperado

Aja como engenheiro sênior responsável por qualidade e manutenibilidade de longo prazo.

Antes de escrever código:

- Leia o código existente ao redor do arquivo que você vai mexer.
- Identifique padrões, arquitetura e convenções já adotadas.
- Prefira consistência com o código atual a introduzir padrões novos.
- Avalie efeitos colaterais e impacto em outras partes do sistema (contrato com o frontend, banco, docs).

Prioridade ao decidir: **correctness → readability → maintainability → consistency → performance** (performance só quando relevante).

Evite complexidade desnecessária, over-engineering e soluções que desviem da arquitetura atual.

### Estratégia de decisão (quando há múltiplas soluções)

1. A solução correta mais simples
2. A mais legível
3. A mais consistente com o codebase
4. Razoável em performance e escalabilidade

Se uma mudança ameaça introduzir instabilidade, inconsistência ou complexidade desnecessária, prefira a versão mais simples e segura.

### Inspirações de design e organização

1. **Procure primeiro no próprio projeto.** `src/modules/users/` é o módulo de referência (CRUD completo: listagem paginada, busca, ordenação por allowlist, criação, edição parcial, exclusão lógica, escopo por empresa). `session/` é a referência de autenticação; `upload/` de stream para storage. Replique a anatomia, os nomes e o formato de resposta que já existem. Padronização interna **sempre** vence preferência individual.
2. **Sem referência interna, siga o consolidado**: documentação oficial do Fastify e do Prisma, semântica REST (métodos e status codes), OWASP para segurança.
3. **Se a decisão vai virar padrão para outros módulos, documente aqui.**

Resumo: **consistência interna > inspiração externa > improvisar do zero.**

---

## Documentação acompanha a mudança — parte do DoD

**SEMPRE** que você mexer em algo que impacte o **funcionamento** ou o **contrato** da API (rota nova, campo novo, mudança de formato, regra, mensagem visível), **atualize a documentação correspondente na mesma mudança**. Documentação divergente do código é pior que documentação inexistente.

- **Contrato HTTP** → os schemas Zod da rota são a doc. Preencha `summary`, `description`, `tags` e `describe()` nos campos. Depois rode `npm run openapi:export` e commite [`docs/openapi.json`](docs/openapi.json) atualizado: o frontend e o app leem esse arquivo.
- **Convenção que vai se repetir → registre neste `CLAUDE.md`.**
- **Como rodar, script novo, variável de ambiente nova → `README.md`** e `.env.example`.
- Só é dispensável quando a mudança **não afeta o uso** (refactor interno, teste, tooling).

---

## Linguagem de código

- Todo código-fonte em **inglês**. Mensagens para o usuário final (erros, confirmações, `describe()` de campo) em **pt-BR**.
- `camelCase` para variáveis, funções e arquivos. Arquivos nomeados por **verbo + entidade + camada**: `listUsers.controller.ts`, `findUserById.service.ts`, `createUser.schema.ts`.
- Nomes claros e que revelem intenção. Sem abreviações desnecessárias.
  - Prefira: `authenticateUserService`, `listUsersQuerySchema`, `buildPublicFileUrl`
  - Evite: `data`, `info`, `handleThing`, `processStuff`
- Código auto-documentado é melhor que comentário. Comente o **porquê** (regra de negócio, armadilha), não o **o quê**.

---

## TypeScript

- **Evite `any`** (warning de lint). Use tipos explícitos, genéricos ou `unknown` + narrowing.
- **Sem non-null assertion (`!`)** — é erro de lint. Use `assertExists(valor, "Rótulo")` de `@/lib/errors`, que lança 404 e estreita o tipo.
- Tipos de request derivam do schema: `type LoginBody = z.infer<typeof loginBodySchema>`. Nunca declare o shape à mão.
- `import { type X }` inline para tipos (`verbatimModuleSyntax` está ligado).
- `interface` para shapes de objeto; `type` para uniões e aliases.
- Return type explícito em funções exportadas de `lib/`; nos services a inferência do Prisma é bem-vinda (o `select` define o shape).
- Mantenha o `tsconfig` em `strict` + `noUncheckedIndexedAccess`. Não relaxe flags para "fazer compilar" — conserte o tipo.

---

## Qualidade de código

- Implementações simples e explícitas.
- Sem abstrações prematuras. Três linhas parecidas é melhor que uma abstração precoce.
- Funções pequenas, com responsabilidade única. Um arquivo por controller, por schema de rota e por service.
- Remova código redundante/não-usado **apenas dentro do escopo da mudança atual**.
- Sem error handling, fallbacks ou validação para cenários que não podem acontecer. Valide nas fronteiras: schema Zod da rota (entrada) e `assertExists` (banco). Confie em código interno.

### Refatoração

- Não quebre comportamento existente nem o contrato com os clientes.
- Refatoração incremental e segura > grandes rewrites.
- Limite o escopo ao que se relaciona com a tarefa atual.

---

## Error handling

- **Lance, não responda.** Em service, hook ou controller, lance um `AppError` de `@/lib/errors`: `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `ServiceUnavailableError` (503). Nunca `reply.status(4xx).send(...)` fora do `errorHandler`.
- A resposta de erro é sempre `{ message, details?, issues? }` com `message` em pt-BR pronta para o toast do frontend. Nunca stack, nome de tabela, SQL ou dado pessoal na mensagem.
- Tudo que não é `AppError` vira **500 genérico**, é logado com `request.log.error` e reportado a `ERROR_LOG_URL` (produção). Não engula erro com `catch` vazio; se precisa continuar, logue com `warn`.
- **Não trate validação à mão.** O schema Zod da rota responde 400 com `issues: [{ path, message }]`. `checkValues`, `needExist` e afins da estrutura antiga não existem mais.
- Erros do Prisma com significado HTTP já são traduzidos (`P2002` → 409, `P2025` → 404, `P2003` → 400). Prefira mesmo assim checar antes (`findUnique` + `ConflictError`) para dar mensagem específica.
- Log via `request.log` / `app.log` (pino). `console.*` é erro de lint em `src/` (liberado em `prisma/`, `scripts/` e testes).

---

## Segurança

- **Toda entrada passa pelo schema Zod da rota** (`body`, `querystring`, `params`). Nunca leia `request.body` numa rota sem schema. O único caso especial é multipart (upload), lido como stream no controller.
- **Escopo por empresa (tenant).** Todo service que lê ou escreve dado de negócio recebe `companyId` (de `getAuthenticatedUser(request)`) e filtra por ele. Registro de outra empresa responde **404, nunca 403** — não revelamos que existe.
- **Ordenação e filtro dinâmicos só por allowlist** (`sortQuerySchema([...])`). Nunca interpole nome de coluna vindo da query.
- **Senha**: bcrypt (custo 12), comparada em tempo constante mesmo quando o e-mail não existe. Nunca sai em resposta — `userSelect` não inclui `password`; response schemas descartam campos extras.
- **Sessão** em cookie HTTP-only, `SameSite=Lax`, `Secure` em produção. Nada de token em body, query ou `localStorage`.
- **Rate limit** em login e register (`LOGIN_RATE_LIMIT`). Rotas novas sensíveis (recuperação de senha, envio de e-mail) também recebem `config: { rateLimit }`.
- **Variáveis de ambiente** só em `src/config/env.ts` (validado com Zod). `process.env` fora dali é erro de lint.
- Helmet e CORS por allowlist (`CORS_ORIGINS`) já estão ligados em `app.ts`.

### Object injection — nunca indexe objeto/array com variável

O ESLint (`security/detect-object-injection`) sinaliza `obj[key]` / `arr[i]` quando a chave é uma **variável**. O risco: chave vinda de input pode resolver para `__proto__` / `constructor` (prototype pollution) ou expor propriedade indevida.

**Regra dura: não escreva código que dispare esse aviso** e nunca silencie com `eslint-disable`.

- **Lookup por chave** → `Map` (`.get()` não é sink) ou `switch`. Veja `fastifyErrorMessages` e `prismaErrorResponses` em `src/lib/errors/errorHandler.ts`.
- **Chave de input** (query, body, params) → valide com `z.enum([...])` antes de qualquer uso. Chave de objeto literal (`{ [query.orderBy]: query.order }`) é aceitável **só** depois de passar por `z.enum` — é o que `sortQuerySchema` garante.
- **Iteração** → `for...of`, `.map`, `.find`, `.at(i)`. `arr[i]` só com `i` literal.
- **Cookie/header por nome** → desestruture (`const { token } = request.cookies`) em vez de `request.cookies[name]`.

### LGPD e dados pessoais (PII)

Produto pt-BR opera sob a LGPD. Considere PII e **proibido logar** em qualquer canal (pino, `ERROR_LOG_URL`, mensagem de erro, query string):

- **Identificadores**: nome completo, CPF, CNPJ de pessoa física, RG, CNH, passaporte.
- **Contato**: e-mail, telefone, endereço, CEP.
- **Credenciais e sessão**: senha (qualquer forma), hash, token, cookie de sessão, código 2FA.
- **Financeiro**: cartão, CVV, dados bancários, chave PIX.
- **Sensíveis (art. 5º, II)**: saúde, biometria, origem racial, religião, opinião política, orientação sexual.

Regras práticas:

- O logger já redige `cookie`, `authorization` e `set-cookie` (`src/config/logger.ts`). Não logue `request.body` de rotas com PII.
- `reportError` envia só `requestId`, método, URL e **id** do usuário. Mantenha assim.
- Mensagem de erro não ecoa o input: `"E-mail já cadastrado."`, nunca `"O e-mail x@y.com já existe."`.
- Query string nunca leva PII (`?email=` vira log de servidor). Use body em POST.
- Seeds e factories usam dados fictícios (`@example.com`).

---

## Performance

- **Listagem sempre paginada** (`paginationQuerySchema`, máx. `MAX_PAGE_SIZE`). Sem `findMany` sem `take`.
- `select` explícito em toda consulta (ver `users.select.ts`). Nunca `include` cego nem devolver a linha inteira.
- `prisma.$transaction([findMany, count])` para lista + total numa ida só.
- **Índices**: toda FK e todo `deletedAt` têm `@@index` no schema. Campo novo usado em `where`/`orderBy` frequente ganha índice na mesma migration.
  - Exceção: **FK que é prefixo (primeira coluna) de um `@@unique` ou `@@index` composto dispensa índice próprio**, porque o composto já atende a busca por ela. Ex.: `Role.companyId` coberto por `@@unique([companyId, name])`, `UserRole.userId` por `@@unique([userId, roleId])`. A FK que não é a primeira coluna (`UserRole.roleId`) continua com `@@index` próprio. Registre no comentário do model qual índice cobre a FK.
- Upload é stream (arquivo → S3) sem passar por memória ou disco. Mantenha.
- Custo do bcrypt cai para 4 em teste (`env.isTest`), não mexa em produção.

---

## Testes

Uma camada só: **integração real** com Vitest + `app.inject()` contra um Postgres descartável. Sem mock de banco, sem porta HTTP, sem Docker dentro do teste.

- Banco de teste: `server_template_test` (criado pelo `docker compose` e, se faltar, pelo `globalSetup`). O `globalSetup` **recusa** rodar contra banco cujo nome não termine em `_test`, porque cada teste começa com `TRUNCATE` (ver `src/tests/setup.ts`). **Tabela nova entra na lista do `TRUNCATE`.** Depois do `TRUNCATE`, o `setup.ts` roda `syncPermissionCatalogService()`: todo teste começa com o catálogo de permissões no banco.
- Ambiente sintético em `src/tests/testEnv.ts`: independente do `.env` local, exceto pelo endereço do banco, derivado do `DATABASE_URL` do arquivo `.env` (mesmo servidor, banco `server_template_test`). `TEST_DATABASE_URL` sobrescreve (CI). O `DATABASE_URL` do shell é ignorado de propósito.
- Todos os testes vivem em [`src/tests/`](src/tests), importados via alias `@/`:

```
src/tests/
├── setup.ts                       # TRUNCATE + sincronização do catálogo de permissões antes de cada teste, $disconnect no fim
├── globalSetup.ts                 # cria o banco de teste e roda migrate deploy
├── testEnv.ts
├── helpers/
│   ├── app.ts                     # createTestApp(options) → app pronto para inject()
│   ├── session.ts                 # sessionCookiesFor(userId) → cookie válido sem passar pelo login
│   ├── factories.ts               # createCompany(), createRole({...}), findAdminRole(companyId), createUser({...})
│   ├── companyAdminsLock.ts       # raceAgainstAdminChange({...}) → corrida do último administrador, determinística
│   └── multipart.ts               # buildMultipartBody([...]) para upload
├── modules/<módulo>/<endpoint>.test.ts
├── hooks/<hook>.test.ts
└── lib/<grupo>/<arquivo>.test.ts
```

- **Permissões nos testes**: `createCompany()` cria a empresa com o cargo `Administrador` (como o register). `createUser()` sem `permissions` recebe esse cargo, com o catálogo inteiro; `permissions: []` cria o usuário sem cargo; `permissions: ["backoffice.users.read"]` cria um cargo só com essas; `roleIds` vincula cargos já criados (`createRole`). Teste de 403 usa um usuário com todas as permissões menos a exigida.

- **Todo endpoint novo tem teste** cobrindo: happy path (status + shape da resposta), validação (400 com `issues`), sem sessão (401), sem a permissão exigida (403), registro de outra empresa (404) e cada regra de negócio (409, 403, mensagem). Filtro e ordenação exigem **dado**: semeie registros que entram e que ficam de fora e asserte os dois lados.
- Teste o caminho de falha, não só o feliz. Asserte a mensagem pt-BR: ela é contrato com o frontend.
- S3 é mockado com `aws-sdk-client-mock` (`mockClient(S3Client)`); nenhum teste faz rede.
- Factories em `helpers/factories.ts`; não escreva `prisma.user.create` gigante inline.
- Um `createTestApp()` por arquivo (`beforeAll`) e `app.close()` no `afterAll`. Para opções diferentes (ex.: rate limit), crie um segundo app dentro do teste e feche-o.

### Rode a suíte ao concluir a tarefa (obrigatório)

Ao terminar **qualquer** tarefa que toque `src/`, rode `npm run check` (lint + typecheck + test) com o Postgres no ar (`npm run db:up`) **e reporte o resultado** (ex.: "check verde, 74/74"). Uma tarefa **não está pronta** com teste vermelho ou sem teste para o comportamento novo.

---

## Git e commits

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`.
- Um commit, uma mudança lógica. Migration entra no mesmo commit da mudança de schema que a gerou.
- Mensagens em inglês, modo imperativo: `add user deactivation endpoint` (não `added`/`adding`).
- PRs pequenos e revisáveis. Se não dá para revisar em 30 min, está grande demais.
- Husky + lint-staged rodam ESLint e Prettier no `pre-commit`. O `pre-push` roda `typecheck + test` (precisa do Postgres). Não pule hooks (`--no-verify`) — se algo quebra, conserte; não bypasse.
- `src/generated/` (client do Prisma) e `dist/` não entram no repositório. `docs/openapi.json` entra.

---

## Estrutura de pastas

```
src/
├── app.ts                  # buildApp(): plugins, compiladores Zod, error handler, rotas. Sem listen.
├── server.ts               # sincroniza o catálogo de permissões, listen + graceful shutdown (SIGINT/SIGTERM)
├── routes.ts               # árvore /api → /client → módulos; grupo protegido com requireSession
├── config/
│   ├── env.ts              # ÚNICO lugar que lê process.env, validado com Zod
│   ├── constants.ts        # cookie, paginação, limites, rate limit
│   ├── cors.ts · logger.ts · swagger.ts
├── hooks/
│   ├── requireSession.ts   # onRequest das rotas protegidas: cookie → JWT → usuário + permissões → request.user
│   └── requirePermission.ts # preHandler por rota: requirePermission(nome) / requireAnyPermission([nomes]) → 403
├── lib/                    # infraestrutura compartilhada; NÃO importa de modules/
│   ├── prisma.ts           # client único + `notDeleted`
│   ├── errors/             # AppError e filhos, assertExists, errorHandler, reportError
│   ├── http/               # pagination, query (search/boolean/csv), responses (erro, message, data)
│   ├── validation/         # primitivos Zod pt-BR (email, senha, cpf, cnpj, cep, telefone, datas)
│   ├── auth/               # password (bcrypt), session (JWT + cookie), authenticatedUser
│   ├── storage/s3.ts       # client S3 preguiçoso, URL pública, 503 quando não configurado
│   └── format/             # máscaras e unmask pt-BR
├── modules/<módulo>/       # um módulo por recurso de negócio
│   ├── <módulo>.routes.ts  # registra rotas: método, path, schema, handler
│   ├── schemas/            # um arquivo por endpoint: body/query/params + response + rota (tags, summary)
│   ├── controllers/        # um por endpoint: lê request, chama service, responde
│   ├── services/           # um por caso de uso: regra de negócio + Prisma. Único lugar que importa @/lib/prisma
│   └── <módulo>.select.ts  # (opcional) selects Prisma compartilhados pelo módulo
├── generated/prisma/       # client gerado (gitignored)
└── tests/                  # ver seção Testes
prisma/
├── schema.prisma · migrations/ · seed.ts
scripts/exportOpenApi.ts    # npm run openapi:export → docs/openapi.json
docs/openapi.json           # contrato gerado; commitado
```

Módulos atuais: `health` (liveness/readiness), `session` (login, register, logout), `users` (CRUD de referência), `upload` (arquivo → S3), `permissions` (catálogo, sincronização, cargo `Administrador`, permissões efetivas, invariante do último administrador e a trava dela; sem rotas).

---

## Convenções do projeto

### Imports

- **Sempre pelo alias `@/`** (`@/lib/errors`, `@/modules/users/services/...`). Caminho relativo é erro de lint e quebra o build (`tsc-alias`).
- Ordem: builtin → externos → `@/` → tipos, com linha em branco entre grupos (`import-x/order`, auto-fixável).

### Camadas e regras de import (verificadas pelo lint)

`routes → controllers → services → prisma`, com `schemas` ao lado.

| Camada        | Pode importar                                   | Não pode                                 |
| ------------- | ----------------------------------------------- | ---------------------------------------- |
| `*.routes.ts` | controllers, schemas do próprio módulo, `@/hooks/*` (`requirePermission`), config | `@/lib/prisma`, services |
| `controllers` | services, schemas (tipos), `@/lib/*`, config    | `@/lib/prisma`                           |
| `services`    | `@/lib/prisma`, `@/lib/*`, schemas (tipos), services de outros módulos | controllers, `reply`      |
| `schemas`     | `zod`, `@/lib/http`, `@/lib/validation`, schemas de outros módulos | `@/lib/prisma`, services |
| `hooks`       | services, `@/lib/*`, `permission.catalog` (tipos) | `@/lib/prisma`                         |
| `lib`, `config` | `@/lib/*`, `@/config/*`, `@/generated`        | `@/modules/*`                            |

Entre módulos, importe só **services** e **schemas** (a superfície pública). Controller de um módulo nunca importa controller de outro. O módulo `permissions` expõe também `permission.catalog.ts` (catálogo, `PermissionName`, `ADMIN_ROLE`) e `permissions.select.ts` (`effectivePermissionsSelect({ userId } | { companyId })` + `toPermissionNames`, para ler usuário e permissões na mesma consulta).

### Anatomia de um endpoint — checklist para criar um novo

Exemplo: `PATCH /api/client/users/:userId`.

1. **Schema** — `src/modules/<módulo>/schemas/<verboEntidade>.schema.ts`:
   - `xxxBodySchema` / `xxxQuerySchema` / `xxxParamsSchema` compondo primitivos de `@/lib/validation/schemas` e helpers de `@/lib/http`. `describe()` em cada campo, mensagens pt-BR.
   - `export type XxxBody = z.infer<typeof xxxBodySchema>`.
   - `xxxResponseSchema` com o shape exato da resposta (campos extras são descartados na serialização; `Date` do Prisma usa `dateTimeOutputSchema`).
   - `xxxRouteSchema = { tags, summary, description, security: [{ cookieAuth: [] }] (se protegida), body/querystring/params, response: { 200/201, 400, 401, 403, 404, 409... : errorResponseSchema } }`. Rota com permissão cita a exigida na `description` (``"Exige `backoffice.users.read`."``) e declara o 403.
2. **Service** — `services/<verboEntidade>.service.ts`: recebe `{ companyId, ...dados }`, aplica regra, fala com o Prisma (`select` explícito, `...notDeleted`), lança `AppError`, devolve o dado. Sem `request`/`reply`.
3. **Controller** — `controllers/<verboEntidade>.controller.ts`: `getAuthenticatedUser(request)`, chama o service, `reply.status(N).send(...)`. Nada de regra aqui.
4. **Rota** — em `<módulo>.routes.ts`: `app.patch("/:userId", { schema: xxxRouteSchema, preHandler: requirePermission("backoffice.users.update") }, xxxController)`. Rotas com parâmetro por último. Rota raiz (`"/"`) com `prefixTrailingSlash: "no-slash"`. Permissão nova? Acrescente em `permission.catalog.ts` antes (ver **Sessão e autenticação**).
5. **Tag nova?** Registre em `src/config/swagger.ts` com descrição.
6. **Módulo novo?** Crie a pasta, exporte `xxxRoutes: FastifyPluginAsyncZod` e registre em `src/routes.ts` (dentro do grupo protegido, salvo rota pública).
7. **Banco mudou?** Edite `prisma/schema.prisma`, rode `npm run db:migrate -- --name <descricao>`, adicione a tabela nova ao `TRUNCATE` de `src/tests/setup.ts` e, se fizer sentido, ao `prisma/seed.ts`.
8. **Teste** em `src/tests/modules/<módulo>/<verboEntidade>.test.ts` (ver seção Testes), incluindo 403 sem a permissão e sucesso só com ela.
9. `npm run openapi:export` e commite `docs/openapi.json`.
10. `npm run check` verde.

### Formato das respostas

| Situação                 | Corpo                                          | Status |
| ------------------------ | ---------------------------------------------- | ------ |
| Um registro              | `{ user: {...} }` (chave = entidade no singular) | 200    |
| Lista                    | `{ users: [...], count: <total sem paginação> }` | 200    |
| Criação                  | `{ message: "Usuário criado.", user: {...} }`  | 201    |
| Edição                   | `{ message: "Usuário atualizado.", user: {...} }` | 200 |
| Exclusão / ação sem dado | `{ message: "Usuário excluído." }`             | 200    |
| Sessão                   | `{ success: true, user: {...} }`               | 200/201 |
| Erro                     | `{ message, details?, issues? }`               | 4xx/5xx |

`message` em resposta de sucesso vira **toast de sucesso** no frontend automaticamente. Por isso listagens e buscas **não** levam `message`.

### Paginação, ordenação e filtros (contrato com a DataTable do frontend)

- Query: `page` (**0-based**, padrão 0), `pageSize` (padrão 50, máx. 100), `orderBy` (allowlist), `order` (`asc`|`desc`), `search` (texto livre), filtros nomeados (`isActive=true`, listas `status=a,b,c` via `csvQuerySchema`).
- Componha: `paginationQuerySchema.extend(sortQuerySchema([...campos], { orderBy, order }).shape).extend({ ...filtros })`.
- No service: `toSkipTake(query)`, `orderBy: { [query.orderBy]: query.order }`, `$transaction([findMany, count])`.
- Defina **sempre** uma ordenação padrão explícita.

### Sessão e autenticação

- Login grava o cookie `token` (`SESSION_COOKIE_NAME`) com JWT curto (`sub` = id do usuário, expira em `SESSION_TTL_HOURS`). Logout limpa o cookie com as **mesmas opções** (`sessionCookieOptions`).
- `requireSession` (hook `onRequest` do grupo protegido em `routes.ts`) valida o JWT, **recarrega do banco o usuário e as permissões efetivas numa leitura só** (bloqueio, exclusão e mudança de cargo valem na próxima requisição, sem novo login) e preenche `request.user`. O JWT não carrega permissão.
- Em controller protegido use `getAuthenticatedUser(request)` — devolve `{ id, name, email, companyId, permissions }` já estreitado.
- Rota pública nova (ex.: recuperação de senha) entra em `session.routes.ts` ou num módulo registrado **fora** do grupo protegido.

#### Permissões (RBAC, no padrão do sul-oxidos)

- **Modelo**: catálogo de `Permission` **global** (igual para toda empresa); `Role` (cargo) **por empresa** (`companyId`, `name` único na empresa mesmo após exclusão lógica); `RolePermission` e `UserRole` ligam as pontas. Um usuário pode ter vários cargos; as permissões efetivas são a **união dos cargos não excluídos**. Não há permissão direta por usuário.
- **Nome**: `modulo.entidade.acao`, entidade em camelCase (`backoffice.users.read`, `backoffice.systemConfigs.update`). Não existe permissão de acesso a módulo.
- **Catálogo** em `src/modules/permissions/permission.catalog.ts` (`PERMISSION_CATALOG`): fonte única, com `module`, `groupLabel`, `action`, `label` pt-BR e `sortOrder` para a tela de cargos. `syncPermissionCatalogService()` leva o catálogo ao banco: cria as novas, atualiza metadados, apaga as de `OBSOLETE_PERMISSION_NAMES`. Permissão **nova** chega só ao cargo `Administrador` de cada empresa; permissão retirada à mão de um cargo não volta. Nunca renomeie um `name`: mova o antigo para obsoletas e crie o novo.
- **Onde a sincronização roda**: na **subida do servidor** (`server.ts`, antes do `listen`), no seed e no `setup.ts` da suíte. Em produção ela depende do schema atualizado: o `prisma migrate deploy` roda **antes** de subir a versão nova. Falha na sincronização (ex.: migration não aplicada) impede a subida com `Falha ao sincronizar o catálogo de permissões` no log. Execuções simultâneas (várias instâncias subindo, seed com a suíte) se serializam por `pg_advisory_xact_lock`, primeiro comando da transação do service (por `$executeRaw`, porque devolve `void`); a transação tem `timeout` de 30 s para a instância que espera a trava não cair no P2028.
- **Cargo `Administrador`**: toda empresa tem um (`isSystem: true`, `ADMIN_ROLE`), com o catálogo inteiro, criado por `createAdminRoleService` junto com a empresa (register, seed).
- **Último administrador**: a empresa nunca fica sem administrador ativo. Todo caminho que pode reduzir os administradores ativos (bloquear, excluir, tirar o cargo `Administrador`) segue o mesmo padrão, numa transação interativa só: (1) `lockCompanyAdminsService({ companyId }, tx)` trava a linha da empresa (`SELECT ... FOR NO KEY UPDATE`), (2) `isLastActiveAdminService({ companyId, userId }, tx)` com o mesmo `tx` e `BadRequestError` (400) quando for o último, (3) a escrita pelo `tx`. Sem a trava, duas requisições simultâneas passam juntas pela checagem e a empresa fica sem administrador. Trabalho lento (bcrypt) vai antes da transação. Referência: `updateUserService` e `deleteUserService`; o teste da corrida usa `raceAgainstAdminChange` de `src/tests/helpers/companyAdminsLock.ts`.
- **Rota com permissão**: `preHandler: requirePermission("backoffice.users.read")` (ou `requireAnyPermission([...])` quando basta uma), de `@/hooks/requirePermission`. O parâmetro é `PermissionName`: nome fora do catálogo não compila. Falta de permissão lança `ForbiddenError("Você não possui permissão de acesso.")` (403). Rota sem `preHandler` só exige sessão (hoje: `GET /users/me` e upload).
- Permissão **nova**: (1) acrescente em `PERMISSION_CATALOG` (grupo e `sortOrder` coerentes), (2) use em `requirePermission`, (3) nada a rodar à mão: o `npm run dev` reinicia ao salvar e sincroniza na subida (e o deploy, depois do `migrate deploy`), (4) teste 403/2xx.
- **Na sessão**: login, register e `GET /users/me` devolvem `user.permissions: string[]`, achatado e em ordem alfabética. O frontend esconde menu e botões com `includes`; quem autoriza é o backend.
- Cargo ou usuário de outra empresa responde **404** (mesma regra do tenant). Ao vincular usuário e cargo, os dois precisam ser da mesma empresa: o banco **não** garante isso (não há FK composta), a aplicação garante em dois pontos: o service de vínculo recusa, e a leitura das permissões efetivas (`effectivePermissionsSelect`) só considera cargo da empresa do usuário, então um vínculo cruzado gravado por fora nunca concede permissão.

### Multi-tenant e exclusão lógica

- `Company` é o tenant. `User.companyId` é obrigatório. Toda entidade de negócio nova ganha `companyId` + `@@index([companyId])` e é filtrada por ele nos services. `Role` também é por empresa (cargo de outra empresa responde 404); só o catálogo `Permission` é global.
- Exclusão é lógica: `deletedAt` + `@@index([deletedAt])`. Leitura filtra `...notDeleted` (de `@/lib/prisma`). Excluir = `update({ deletedAt: new Date() })`, nunca `delete`.
- `email` de usuário continua único após exclusão lógica (decisão do template). Reativar = limpar `deletedAt`.

### Prisma

- Schema em `prisma/schema.prisma`; client gerado em `src/generated/prisma` (`npm run db:generate`, roda no `postinstall`). Importe tipos de `@/generated/prisma/client` (`Prisma.UserWhereInput`, `Prisma.UserSelect`).
- IDs `uuid(7)` (ordenáveis por tempo). Tabelas em `@@map("snake_ou_camel")` plural.
- Migrations: `npm run db:migrate -- --name <descricao>` em dev; `npm run db:deploy` em CI/produção. Nunca edite migration já aplicada.
- Seed idempotente (`upsert`) em `prisma/seed.ts`; dados fictícios.
- Transação: `prisma.$transaction([...])` para leituras em lote; `prisma.$transaction(async (tx) => ...)` para escrita atômica — passe `tx` para os services envolvidos quando precisar (assinatura `client: Prisma.TransactionClient = prisma`).
- Regra que depende de contar linhas ("não pode ficar sem nenhum") checa e escreve na mesma transação, **depois de travar** a linha que agrupa o conjunto (ver **Último administrador**). SQL cru só por template tagueado (`` tx.$queryRaw`... ${valor}` ``), que vira parâmetro; nunca `$queryRawUnsafe` com valor interpolado.

### Variáveis de ambiente

- Declare em `src/config/env.ts` (schema Zod, com `default`/`optional`) e em `.env.example` (com comentário). Sem os dois, a variável não existe.
- Leia sempre por `env.NOME` de `@/config/env`. Derivados úteis: `env.isProduction`, `env.isTest`, `env.corsOrigins`, `env.sessionTtlSeconds`, `env.storage` (null quando S3 não configurado).
- Variável obrigatória ausente derruba a API na subida com mensagem clara — é intencional.

### Upload

- `POST /api/client/upload/file`, campo multipart `file`, um arquivo por requisição, até `MAX_UPLOAD_FILE_SIZE_IN_BYTES`. Resposta `{ Location, key, fileName, originalName, mimeType, size }`; o frontend usa `Location` e depois manda só a URL na entidade.
- Sem `AWS_*` a rota responde **503** (`getStorageConfig`). O bucket precisa de política de leitura pública; ACL por objeto não é usada.
- A rota usa um `validatorCompiler` local que aceita qualquer body: multipart não passa pelo Zod. É a única exceção do projeto.

### Contrato com os clientes (frontend web e app)

O que `../frontend-template` já consome — mantenha compatível:

- `POST /api/client/session/login` e `/register` → `{ success, user }`; `POST /session/logout` → `{ success }`; `GET /users/me` → `{ user }`. `user` = `{ id, name, email, image | null, permissions: string[] }`. 401 em `/users/me` = frontend redireciona para o login.
- Falta de permissão numa rota responde **403** `{ message: "Você não possui permissão de acesso." }`.
- Erro sempre com `message` no topo (`extractResponseMessage` do frontend lê `message` plano ou aninhado um nível).
- Sucesso de mutation com `message` → toast automático.
- Listas: `page` 0-based, `pageSize`, `orderBy`, `order`, filtros múltiplos `a,b,c`; resposta `{ <entidades>, count }`.
- Upload: `POST /upload/file` com campo `file`, resposta com `Location`.
- Datas trafegam como ISO 8601 UTC. Data sem hora vai como `AAAA-MM-DD` (coluna `@db.Date`).
- Campo futuro já previsto pelo frontend em `user`: `idleTimeoutMinutes?: number | null`. Quando implementar, use exatamente esse nome. (`permissions` já é entregue.)
- `../app-template` hoje roda em modo fake e espera token no header `Authorization` — ainda **não** é atendido por esta API (decisão: cookie apenas). Ao integrar o app, a decisão precisa ser revista aqui e no app.

### Swagger / OpenAPI

- UI em `/docs`, JSON em `/docs/json`. Gerado dos schemas Zod pelo `jsonSchemaTransform`; `meta({ examples: [...] })` vira exemplo no formulário do Swagger.
- Segurança: `cookieAuth`. Para testar rotas protegidas, faça login pelo próprio Swagger no mesmo navegador.
- `docs/openapi.json` é o snapshot commitado (`npm run openapi:export`). Contrato mudou → regenere.

---

## Scripts

| Script                   | O que faz                                                          |
| ------------------------ | ------------------------------------------------------------------ |
| `npm run dev`            | API com `tsx` em watch, `.env` carregado pelo Node                 |
| `npm run build`          | `tsc` + `tsc-alias` → `dist/` (ESM com extensões e alias resolvidos) |
| `npm start`              | Roda `dist/server.js`                                              |
| `npm run lint`           | ESLint (camadas, imports, segurança)                               |
| `npm run format`         | Prettier (escrita)                                                 |
| `npm run typecheck`      | `tsc --noEmit`                                                     |
| `npm test`               | Vitest run (precisa do Postgres)                                   |
| `npm run test:watch`     | Vitest watch                                                       |
| `npm run check`          | Lint + typecheck + test                                            |
| `npm run db:up` / `db:down` | Sobe/derruba o Postgres do compose                              |
| `npm run db:migrate -- --name x` | Cria e aplica migration em dev                             |
| `npm run db:deploy`      | Aplica migrations pendentes (CI/produção)                          |
| `npm run db:seed`        | Sincroniza o catálogo de permissões e popula `admin@admin.com` / `123123123` (Administrador) |
| `npm run db:generate`    | Gera o client do Prisma                                            |
| `npm run db:studio`      | Prisma Studio                                                      |
| `npm run openapi:export` | Grava `docs/openapi.json`                                          |
| `npm run clean`          | Remove `dist/`, `coverage/` e o client gerado                      |

---

## Ambiente

- Windows (PowerShell) no dia a dia. Em comandos shell use sintaxe PS (`$env:VAR`, sem `&&` em PS 5.1) — nos scripts npm, `&&` funciona porque roda no shell do npm.
- Node >= 22.12 (`.nvmrc` = 22; CI roda em Node 22). `npm` com `package-lock.json`.
- Postgres via `docker compose` (porta `POSTGRES_PORT`, padrão 5432). Se a 5432 já estiver em uso, `POSTGRES_PORT=5433 npm run db:up` e ajuste `DATABASE_URL` no `.env`; a suíte segue o mesmo servidor.
- bcrypt é módulo nativo: em Docker use imagem `node:22-slim` (glibc), já configurado no `Dockerfile`.

---

## 📅 Datas

- Banco: `DateTime` (timestamp UTC) para eventos; `@db.Date` para data civil (nascimento, vencimento).
- Entrada: `dateTimeSchema` (ISO 8601 UTC com `Z`) ou `dateOnlySchema` (`AAAA-MM-DD`) de `@/lib/validation/schemas`. Nunca `z.date()` em body/query.
- Saída: `dateTimeOutputSchema` de `@/lib/http/responses` — aceita o `Date` do Prisma e serializa como ISO. Data civil sai como string `AAAA-MM-DD` (mapeie no service com `toISOString().slice(0, 10)`).
- O servidor não converte fuso: sempre UTC. Formatação para exibição é responsabilidade do cliente.

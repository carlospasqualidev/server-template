# CLAUDE.md

Guia para o Claude trabalhar neste backend. Este arquivo é a fonte de verdade para convenções e comportamento esperado — leia o [`README.md`](README.md) para stack, scripts, variáveis de ambiente e como rodar.

> Os templates irmãos `../frontend-template` (web) e `../app-template` (mobile) consomem esta API. O que eles esperam está na seção **Contrato com os clientes**. Não mude formato de resposta, nome de rota ou de campo sem atualizar o consumidor.

---

## Stack

Node 22+ (ESM) • Fastify 5 • TypeScript strict • Zod 4 + `fastify-type-provider-zod` (um schema gera validação, tipo, serialização e OpenAPI) • Prisma 7 (PostgreSQL via driver adapter `pg`) • JWT em cookie HTTP-only • `@fastify/request-context` (contexto por requisição, só para a trilha de auditoria) • Swagger UI • bcrypt • AWS S3 (upload em stream) • pino • Vitest (integração com Postgres descartável) • ESLint + Prettier + Husky + lint-staged • Docker Compose (Postgres).

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
- **Trilha de auditoria** (ver **Trilha de auditoria**): `description` nunca leva nome, e-mail ou outro dado pessoal; `before`/`after` nunca levam segredo (sai em `pickAuditable`) e trocam por `[omitido]` o valor dos campos pessoais da entidade (`AUDIT_PERSONAL_FIELDS`) e das configurações com `redactInAudit`; o nome do autor vem do relacionamento com `User`, nunca de cópia. `ip` e `userAgent` são gravados (segurança) e não saem pela API. Política de retenção e anonimização da trilha ainda não existe.

---

## Performance

- **Listagem sempre paginada** (`paginationQuerySchema`, máx. `MAX_PAGE_SIZE`). Sem `findMany` sem `take`. Exceções: (1) catálogo finito vindo do código: o de permissões (`GET /roles/permissions`) e o de configurações de sistema (`GET /system-configs`, que lê só as chaves do catálogo, no máximo uma linha por chave pelo índice único); (2) consulta limitada pelo tamanho **validado** do corpo: lista de ids com `.max(MAX_BODY_IDS, "<mensagem pt-BR>")` no schema da rota, usada como `id: { in: [...] }` (ou `userId: { in: [...] }`). Lista sem `max` não é limite; (3) consulta limitada pelo que a própria escrita mudou: os ids que um `DELETE ... RETURNING` devolveu. Para o que fica fora da lista do corpo (ex.: quem sai do cargo), nunca leia o conjunto inteiro: apague com `notIn` ou, quando precisar saber quem saiu (trilha de auditoria), com `DELETE ... RETURNING` em SQL tagueado, que apaga e devolve os ids no mesmo comando (referência: `setRoleUsersService`). O custo acompanha a mudança, não o tamanho do conjunto.
- `select` explícito em toda consulta (ver `users.select.ts`). Nunca `include` cego nem devolver a linha inteira.
- `prisma.$transaction([findMany, count])` para lista + total numa ida só.
- **Índices**: toda FK e todo `deletedAt` têm `@@index` no schema. Campo novo usado em `where`/`orderBy` frequente ganha índice na mesma migration.
  - Exceção: **FK que é prefixo (primeira coluna) de um `@@unique` ou `@@index` composto dispensa índice próprio**, porque o composto já atende a busca por ela. Ex.: `Role.companyId` coberto por `@@unique([companyId, name])`, `UserRole.userId` por `@@unique([userId, roleId])`. A FK que não é a primeira coluna (`UserRole.roleId`) continua com `@@index` próprio. Registre no comentário do model qual índice cobre a FK.
  - Coluna que só entra como ordenação **opcional** de uma lista já filtrada pelo índice de `companyId` não ganha índice próprio: `name`, `email`, `createdAt` e `lastLoginAt` de `users`. O índice de `lastLoginAt` ainda custaria uma escrita a mais em todo login. Reavalie quando a ordenação virar padrão ou o volume por empresa pedir.
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
│   ├── factories.ts               # createCompany(), createRole({...}), findAdminRole(companyId), createUser({...}), findPermissionIds([...]), findRolePermissionNames(roleId), createSystemConfig({ companyId, key, value }), createAuditLog({...}), findAuditLogs(companyId)
│   ├── companyAdminsLock.ts       # raceAgainstAdminChange({...}) → corrida contra a trava da empresa (último administrador, vínculo x exclusão de cargo), determinística
│   ├── permissionCatalogLock.ts   # raceAgainstCatalogSync({...}) → operação concorrente a uma sincronização do catálogo, determinística
│   ├── systemConfigsLock.ts       # raceAgainstSystemConfigsBatch({...}) → lote de configurações concorrente a outro da mesma empresa, determinístico
│   └── multipart.ts               # buildMultipartBody([...]) para upload
├── modules/<módulo>/<endpoint>.test.ts
├── hooks/<hook>.test.ts
└── lib/<grupo>/<arquivo>.test.ts
```

- **Permissões nos testes**: `createCompany()` cria a empresa com o cargo `Administrador` (como o register). `createUser()` sem `permissions` recebe esse cargo, com o catálogo inteiro; `permissions: []` cria o usuário sem cargo; `permissions: ["backoffice.users.read"]` cria um cargo só com essas; `roleIds` vincula cargos já criados (`createRole`). Teste de 403 usa um usuário com todas as permissões menos a exigida.

- **Todo endpoint novo tem teste** cobrindo: happy path (status + shape da resposta), validação (400 com `issues`), sem sessão (401), sem a permissão exigida (403), registro de outra empresa (404) e cada regra de negócio (409, 403, mensagem). Filtro e ordenação exigem **dado**: semeie registros que entram e que ficam de fora e asserte os dois lados.
- **Toda mutação nova tem teste do registro de auditoria** (`findAuditLogs(companyId)`): o registro gravado (módulo, entidade, ação, `before`/`after`, `changedFields`, autor), nenhum segredo nem dado pessoal no JSON e nenhum registro quando a mutação falha. Os testes da trilha ficam em `src/tests/modules/audit/`.
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
│   ├── http/               # pagination, query (search/boolean/csv/intervalo de datas), responses (erro, message, data)
│   ├── validation/         # primitivos Zod pt-BR (email, senha, cpf, cnpj, cep, telefone, datas)
│   ├── auth/               # password (bcrypt), session (JWT + cookie), authenticatedUser
│   ├── audit/              # contexto da requisição para a trilha (auditContext) e cura do antes/depois (auditSnapshot)
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

Módulos atuais: `health` (liveness/readiness), `session` (login, register, logout), `users` (CRUD de referência), `upload` (arquivo → S3), `audit` (trilha de auditoria: gravação pelas mutações, lista, detalhe e opções de filtro), `permissions` (catálogo, sincronização, cargo `Administrador`, permissões efetivas, anti-escalonamento, invariante do último administrador e a trava dela; sem rotas), `roles` (gestão de cargos: catálogo agrupado, CRUD, cópia, usuários do cargo), `systemConfigs` (configurações de sistema por empresa: catálogo no código, leitura, gravação em lote, leitura tipada e a cascata do timeout de inatividade).

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

Entre módulos, importe só **services** e **schemas** (a superfície pública). Controller de um módulo nunca importa controller de outro. O módulo `permissions` expõe também `permission.catalog.ts` (catálogo, `PermissionName`, `PermissionModule`, `ADMIN_ROLE`) e `permissions.select.ts` (`effectivePermissionsSelect({ userId } | { companyId })` + `toPermissionNames`, para ler usuário e permissões na mesma consulta). O módulo `systemConfigs` expõe `systemConfig.catalog.ts` (catálogo, `SystemConfigKey`, `SystemConfigValue<K>`) e `systemConfig.definition.ts` (tipos de valor, conversão e serialização). O módulo `audit` expõe `audit.catalog.ts` (`AuditEntity`, rótulos, campos pessoais) e `recordAuditService`; o `users` expõe `users.audit.ts` (`toUserRolesAuditSnapshot`, o formato "cargos do usuário" na trilha, usado pelos dois caminhos que o mudam).

### Anatomia de um endpoint — checklist para criar um novo

Exemplo: `PATCH /api/client/users/:userId`.

1. **Schema** — `src/modules/<módulo>/schemas/<verboEntidade>.schema.ts`:
   - `xxxBodySchema` / `xxxQuerySchema` / `xxxParamsSchema` compondo primitivos de `@/lib/validation/schemas` e helpers de `@/lib/http`. `describe()` em cada campo, mensagens pt-BR.
   - `export type XxxBody = z.infer<typeof xxxBodySchema>`.
   - `xxxResponseSchema` com o shape exato da resposta (campos extras são descartados na serialização; `Date` do Prisma usa `dateTimeOutputSchema`).
   - `xxxRouteSchema = { tags, summary, description, security: [{ cookieAuth: [] }] (se protegida), body/querystring/params, response: { 200/201, 400, 401, 403, 404, 409... : errorResponseSchema } }`. Rota com permissão cita a exigida na `description` (``"Exige `backoffice.users.read`."``) e declara o 403.
2. **Service** — `services/<verboEntidade>.service.ts`: recebe `{ companyId, ...dados }`, aplica regra, fala com o Prisma (`select` explícito, `...notDeleted`), lança `AppError`, devolve o dado. Sem `request`/`reply`.
3. **Auditoria** — mutação (criar, editar, excluir, mudar status ou vínculo) grava `recordAuditService(...)` **pelo `tx` da escrita**, dentro da mesma `prisma.$transaction(async (tx) => ...)` (abra uma se a escrita não tinha). Entidade nova entra em `audit.catalog.ts`. Ver **Trilha de auditoria**. Leitura não grava.
4. **Controller** — `controllers/<verboEntidade>.controller.ts`: `getAuthenticatedUser(request)`, chama o service, `reply.status(N).send(...)`. Nada de regra aqui.
5. **Rota** — em `<módulo>.routes.ts`: `app.patch("/:userId", { schema: xxxRouteSchema, preHandler: requirePermission("backoffice.users.update") }, xxxController)`. Rotas com parâmetro por último. Rota raiz (`"/"`) com `prefixTrailingSlash: "no-slash"`. Permissão nova? Acrescente em `permission.catalog.ts` antes (ver **Sessão e autenticação**).
6. **Tag nova?** Registre em `src/config/swagger.ts` com descrição.
7. **Módulo novo?** Crie a pasta, exporte `xxxRoutes: FastifyPluginAsyncZod` e registre em `src/routes.ts` (dentro do grupo protegido, salvo rota pública).
8. **Banco mudou?** Edite `prisma/schema.prisma`, rode `npm run db:migrate -- --name <descricao>`, adicione a tabela nova ao `TRUNCATE` de `src/tests/setup.ts` e, se fizer sentido, ao `prisma/seed.ts`.
9. **Teste** em `src/tests/modules/<módulo>/<verboEntidade>.test.ts` (ver seção Testes), incluindo 403 sem a permissão e sucesso só com ela; mutação tem também o teste do registro de auditoria.
10. `npm run openapi:export` e commite `docs/openapi.json`.
11. `npm run check` verde.

### Formato das respostas

| Situação                 | Corpo                                          | Status |
| ------------------------ | ---------------------------------------------- | ------ |
| Um registro              | `{ user: {...} }` (chave = entidade no singular) | 200    |
| Lista                    | `{ users: [...], count: <total sem paginação> }` | 200    |
| Lista finita do código, sem paginação | `{ systemConfigs: [...] }`, sem `count` (a lista inteira sempre vem) | 200 |
| Criação                  | `{ message: "Usuário criado.", user: {...} }`  | 201    |
| Edição                   | `{ message: "Usuário atualizado.", user: {...} }` | 200 |
| Exclusão / ação sem dado | `{ message: "Usuário excluído." }`             | 200    |
| Sessão                   | `{ success: true, user: {...} }`               | 200/201 |
| Erro                     | `{ message, details?, issues? }`               | 4xx/5xx |

`message` em resposta de sucesso vira **toast de sucesso** no frontend automaticamente. Por isso listagens e buscas **não** levam `message`.

### Paginação, ordenação e filtros (contrato com a DataTable do frontend)

- Query: `page` (**0-based**, padrão 0), `pageSize` (padrão 50, máx. 100), `orderBy` (allowlist), `order` (`asc`|`desc`), `search` (texto livre), filtros nomeados (`isActive=true`, listas `status=a,b,c` via `csvQuerySchema`).
- Componha: `paginationQuerySchema.extend(sortQuerySchema([...campos], { orderBy, order }).shape).extend({ ...filtros })`.
- Filtro múltiplo de valor fechado (enum): `csvQuerySchema.pipe(z.array(z.enum(Valores, { message })).optional())`, para valor fora da lista responder 400 em vez de chegar ao Prisma. Período: `<campo>From`/`<campo>To` com `dateTimeQuerySchema` (ISO 8601 UTC, com `Z`) e, no service, `toDateTimeRangeFilter(from, to)`, inclusivo nas duas pontas (`gte`/`lte`), ambos de `@/lib/http/query`. Referência: `listAuditLogsQuerySchema`.
- Filtro por relação (ex.: cargo do usuário): lista de ids em CSV, `csvQuerySchema.pipe(z.array(idSchema).optional())` (id fora do formato responde 400, issue `<campo>.<i>`), aplicada com `some` e **o mesmo escopo que a resposta usa para a relação** (tenant e `deletedAt` do outro lado): id de outra empresa, ou de registro excluído, não encontra ninguém. Qualquer um dos ids basta (OU); o registro sai uma vez só. Referência: `roleId` em `listUsersQuerySchema` e `currentRolesWhere` em `users.select.ts`.
- No service: `toSkipTake(query)`, `orderBy: [{ [query.orderBy]: query.order }, { id: query.order }]` (desempate por `id` no mesmo sentido: sem ele, registros com o mesmo valor mudam de ordem entre consultas e a paginação repete ou pula algum), `$transaction([findMany, count])`. Referência: `listAuditLogsService`.
- Coluna **anulável** na allowlist de ordenação: nulos por último **nos dois sentidos** (`{ [campo]: { sort: order, nulls: "last" } }`), para "nunca aconteceu" não encabeçar a lista no `desc`, e desempate por `id` no mesmo sentido (o uuid v7 cresce no tempo), para a paginação não repetir nem pular registro entre os vários nulos. Referência: `lastLoginAt` em `listUsersService` (`toUsersOrderBy`).
- Defina **sempre** uma ordenação padrão explícita.

### Sessão e autenticação

- Login grava o cookie `token` (`SESSION_COOKIE_NAME`) com JWT curto (`sub` = id do usuário, expira em `SESSION_TTL_HOURS`). Logout limpa o cookie com as **mesmas opções** (`sessionCookieOptions`).
- Login bem-sucedido grava `User.lastLoginAt` e o registro `login` da trilha **numa transação só** (`authenticateUserService`): os dois confirmam ou desfazem juntos. Login que falha (401, 403) não grava nenhum dos dois. O register também abre a sessão e grava `lastLoginAt` na transação que cria o usuário. Os dois passam por `recordLastLoginService`: `UPDATE` em SQL tagueado, sem o `@updatedAt` do Prisma (o `updatedAt` do usuário reflete só edição de cadastro), com a data como parâmetro (`${new Date()}`), nunca `now()` (a coluna é `TIMESTAMP(3)` sem fuso e o `now()` gravaria no fuso da sessão do banco). Não há tabela de sessões: o JWT continua stateless e não é revogável.
- `requireSession` (hook `onRequest` do grupo protegido em `routes.ts`) valida o JWT, **recarrega do banco o usuário e as permissões efetivas numa leitura só** (bloqueio, exclusão e mudança de cargo valem na próxima requisição, sem novo login) e preenche `request.user`. O JWT não carrega permissão. Registra também o usuário como autor no contexto da requisição, lido só pela trilha de auditoria.
- Em controller protegido use `getAuthenticatedUser(request)` — devolve `{ id, name, email, companyId, permissions }` já estreitado.
- Login, register e `GET /users/me` devolvem também `user.idleTimeoutMinutes: number`, já resolvido por `resolveIdleTimeoutMinutesService` (ver **Configurações de sistema**). Quem desloga por inatividade é o cliente; o servidor não impõe o timeout (o JWT vale até `SESSION_TTL_HOURS`).
- Rota pública nova (ex.: recuperação de senha) entra em `session.routes.ts` ou num módulo registrado **fora** do grupo protegido.

### Permissões e cargos

RBAC no padrão do sul-oxidos: base em `src/modules/permissions/` (catálogo, sincronização, permissões efetivas, anti-escalonamento, último administrador; sem rotas) e gestão em `src/modules/roles/` (rotas `/roles`) mais `PUT /users/:userId/roles`.

#### Modelo, catálogo e autorização

- **Modelo**: catálogo de `Permission` **global** (igual para toda empresa); `Role` (cargo) **por empresa** (`companyId`, `name` único na empresa mesmo após exclusão lógica); `RolePermission` e `UserRole` ligam as pontas. Um usuário pode ter vários cargos; as permissões efetivas são a **união dos cargos não excluídos**. Não há permissão direta por usuário.
- **Nome**: `modulo.entidade.acao`, entidade em camelCase (`backoffice.users.read`, `backoffice.systemConfigs.update`). Não existe permissão de acesso a módulo.
- **Catálogo** em `src/modules/permissions/permission.catalog.ts` (`PERMISSION_CATALOG`): fonte única, com `module`, `groupLabel`, `action`, `label` pt-BR e `sortOrder` para a tela de cargos. Módulo novo entra também em `PERMISSION_MODULES` (ordem e rótulo do cabeçalho no `GET /roles/permissions`; o `module` é do tipo `PermissionModule`, então módulo fora do catálogo não compila). `syncPermissionCatalogService()` leva o catálogo ao banco: cria as novas, atualiza metadados, apaga as de `OBSOLETE_PERMISSION_NAMES`. Permissão **nova** chega só ao cargo `Administrador` de cada empresa; permissão retirada à mão de um cargo não volta. Nunca renomeie um `name`: mova o antigo para obsoletas e crie o novo.
- **Onde a sincronização roda**: na **subida do servidor** (`server.ts`, antes do `listen`), no seed e no `setup.ts` da suíte. Em produção ela depende do schema atualizado: o `prisma migrate deploy` roda **antes** de subir a versão nova. Falha na sincronização (ex.: migration não aplicada) impede a subida com `Falha ao sincronizar o catálogo de permissões` no log. Execuções simultâneas (várias instâncias subindo, seed com a suíte) se serializam por `pg_advisory_xact_lock`, primeiro comando da transação do service (por `$executeRaw`, porque devolve `void`); a transação tem `timeout` de 30 s para a instância que espera a trava não cair no P2028. A chave é `PERMISSION_CATALOG_LOCK_NAME` (exportada pelo service).
- **Cargo `Administrador`**: toda empresa tem um (`isSystem: true`, `ADMIN_ROLE`), com o catálogo inteiro, criado por `createAdminRoleService` junto com a empresa (register, seed). O register toma antes a trava do catálogo **compartilhada** (`pg_advisory_xact_lock_shared` na mesma chave, primeiro comando da transação): espera a sincronização em andamento e só então lê o catálogo, sem esperar os outros registers. Sem ela, o cargo nasceria sem a permissão que a sincronização acabou de criar ou falharia por FK ao vincular a que ela está apagando. Todo caminho novo que cria o `Administrador` em produção faz o mesmo; o teste usa `raceAgainstCatalogSync` de `src/tests/helpers/permissionCatalogLock.ts`.
- **Último administrador**: a empresa nunca fica sem administrador ativo. Todo caminho que pode reduzir os administradores ativos (bloquear, excluir, tirar o cargo `Administrador`) segue o mesmo padrão, numa transação interativa só: (1) `lockCompanyAdminsService({ companyId }, tx)` trava a linha da empresa (`SELECT ... FOR NO KEY UPDATE`), (2) `isLastActiveAdminService({ companyId, userId }, tx)` com o mesmo `tx` e `BadRequestError` (400) quando for o último, (3) a escrita pelo `tx`. Sem a trava, duas requisições simultâneas passam juntas pela checagem e a empresa fica sem administrador. Trabalho lento (bcrypt) vai antes da transação. Referência: `updateUserService`, `deleteUserService` e `setUserRolesService`; o teste da corrida usa `raceAgainstAdminChange` de `src/tests/helpers/companyAdminsLock.ts`.
- **Rota com permissão**: `preHandler: requirePermission("backoffice.users.read")` (ou `requireAnyPermission([...])` quando basta uma; `[requirePermission(a), requirePermission(b)]` quando as duas são exigidas), de `@/hooks/requirePermission`. O parâmetro é `PermissionName`: nome fora do catálogo não compila. Falta de permissão lança `ForbiddenError("Você não possui permissão de acesso.")` (403). Rota sem `preHandler` só exige sessão (hoje: `GET /users/me` e upload).
- Permissão **nova**: (1) acrescente em `PERMISSION_CATALOG` (grupo e `sortOrder` coerentes), (2) use em `requirePermission`, (3) nada a rodar à mão: o `npm run dev` reinicia ao salvar e sincroniza na subida (e o deploy, depois do `migrate deploy`), (4) teste 403/2xx.
- **Na sessão**: login, register e `GET /users/me` devolvem `user.permissions: string[]`, achatado e em ordem alfabética. O frontend esconde menu e botões com `includes`; quem autoriza é o backend.
- Cargo ou usuário de outra empresa responde **404** (mesma regra do tenant). Ao vincular usuário e cargo, os dois precisam ser da mesma empresa: o banco **não** garante isso (não há FK composta), a aplicação garante em dois pontos: o service de vínculo recusa, e a leitura das permissões efetivas (`effectivePermissionsSelect`) só considera cargo da empresa do usuário, então um vínculo cruzado gravado por fora nunca concede permissão.

#### Gestão de cargos

- **Rotas** (`/api/client/roles`): `GET /permissions` (catálogo em árvore `{ modules: [{ module, moduleLabel, groups: [{ groupLabel, permissions: [{ id, name, action, label }] }] }] }`), `GET /` (paginado, `search` por nome, `orderBy` `name`/`createdAt`, com `permissionsCount` e `usersCount`) e `GET /:roleId` (com `permissions: [{ id, name }]`): `backoffice.roles.read`. `POST /` e `POST /:roleId/copy`: `backoffice.roles.create`. `PUT /:roleId`: `backoffice.roles.update`. `DELETE /:roleId`: `backoffice.roles.delete`. `GET /:roleId/users` (paginado): `backoffice.roles.read` **e** `backoffice.users.read` (expõe nome e e-mail). `PUT /:roleId/users`: `backoffice.roles.update` **e** `backoffice.users.update`. No módulo de usuários, `PUT /users/:userId/roles`: `backoffice.users.update`.
- **Respostas**: `{ roles, count }`, `{ role }`, `{ message, role }` nas mutations (inclusive `PUT /:roleId/users`), `{ message }` na exclusão; `PUT /users/:userId/roles` responde `{ message, user }` com `user.roles: [{ id, name, isSystem }]`.
- **Nome** único na empresa **inclusive contra cargos excluídos** (409, com mensagem própria quando o dono do nome está excluído): `assertRoleNameAvailableService` antes de gravar; corrida residual cai no P2002 (409 genérico).
- **Permissões do cargo**: `permissionIds` com ao menos um item (400 do schema) e todos existentes no catálogo (400). `resolveRolePermissionIdsService` tira repetição e aplica a **expansão automática**: qualquer ação de escrita (tudo que não é `read`) de um grupo implica o `read` do mesmo grupo (`module` + `groupLabel`). A edição substitui o conjunto inteiro numa transação que começa travando a linha do cargo (`SELECT ... FOR NO KEY UPDATE`, a mesma força do `UPDATE`): edições simultâneas do mesmo cargo se serializam e o estado anterior lido logo depois (para a trilha de auditoria) é exato.
- **Cargo de sistema** (`isSystem`, o `Administrador`): não é editado, excluído nem copiado, e os usuários dele não mudam por `PUT /roles/:roleId/users` (400). Dar ou tirar o `Administrador` de alguém é só por `PUT /users/:userId/roles`, só por quem também é Administrador (ver **Anti-escalonamento**), e guarda o último administrador ativo.
- **Exclusão** lógica (`deletedAt`); cargo com usuários vinculados (não excluídos; bloqueado conta) responde 400. Vínculos restantes (de usuários excluídos) saem junto.
- **Cópia**: nome `"<nome> (cópia)"`, depois `(cópia 2)`... (o primeiro livre, contando excluídos), mesma descrição e permissões, sem usuários, nunca de sistema.
- **Anti-escalonamento** (decisão do dono, mais estrita que o sul-oxidos): ninguém acrescenta a um cargo, nem atribui a alguém, uma permissão que não possui. `assertCanGrantPermissionsService` (módulo `permissions`) responde **403** `"Você não pode conceder permissões que não possui."` quando: criar ou copiar cargo com permissão fora das efetivas do autor (no create, conta o conjunto já expandido, com o `read` implícito); editar cargo **acrescentando** permissão que o autor não tem (manter ou retirar as que o cargo já tem é permitido); atribuir a alguém (pelos dois caminhos, `PUT /roles/:roleId/users` e `PUT /users/:userId/roles`) cargo com permissão fora das efetivas do autor (continuar num cargo, ou tirar alguém dele, não é atribuição). O cargo `Administrador` só é atribuído ou retirado por quem tem o cargo `Administrador` (403 `"Só quem tem o cargo \"Administrador\" pode atribuí-lo ou retirá-lo de alguém."`), mesmo que o autor tenha todas as permissões por outro cargo. A checagem roda **dentro da transação da escrita**, logo antes dela, e relê as permissões efetivas do autor pelo `tx` (`findEffectivePermissionsService(..., tx)`). Todo caminho novo que concede permissão ou cargo passa por ela, com `actorId` e só com o que a mudança acrescenta.
- **Ninguém altera os próprios cargos** (anti auto-bloqueio e auto-escalonamento), pelos dois caminhos: `PUT /users/:userId/roles` com o próprio id e `PUT /roles/:roleId/users` que inclua ou retire o próprio usuário respondem 400 (`OWN_ROLES_CHANGE_MESSAGE`). Continuar num cargo que já tem não é alteração. Os services que mudam cargo ou vínculo (`createRole`, `copyRole`, `updateRole`, `setRoleUsers`, `setUserRoles`) recebem `actorId` por argumento, nunca leem a requisição.
- **Trava**: as mudanças de vínculo usuário-cargo (`setUserRolesService`, `setRoleUsersService`) e a exclusão de cargo tomam `lockCompanyAdminsService` e validam **dentro da transação, depois da trava** (cargo, usuário alvo e ids do corpo, todos filtrando `deletedAt`): um vínculo gravado ao mesmo tempo que a exclusão é visto por ela e barra a exclusão; o cargo ou o usuário excluído ao mesmo tempo que um vínculo responde 404.
- **Limite do corpo**: `permissionIds`, `roleIds` e `userIds` aceitam no máximo `MAX_BODY_IDS` (1000) ids (400 com `issues`). `PUT /roles/:roleId/users` lê só os ids da lista e o autor, e tira quem sai com `DELETE ... RETURNING` (SQL tagueado, mesmo filtro de `roleMembersWhere`), que devolve os ids apagados para a trilha de auditoria sem ler o cargo inteiro; depois lê os cargos restantes só desses usuários. Cargo com mais usuários que o limite é gerido pelos cargos de cada usuário.
- **Tenant**: cargo, usuário ou vínculo de outra empresa responde 404, também quando vem num corpo (`roleIds`, `userIds`). A contagem e a listagem de usuários do cargo (`roleMembersWhere`) só consideram usuário não excluído da mesma empresa.

### Configurações de sistema

Módulo `src/modules/systemConfigs/` (rotas `/api/client/system-configs`), escopo por **empresa**.

- **Definições no código, valores no banco.** `SYSTEM_CONFIG_CATALOG` (`systemConfig.catalog.ts`) é a fonte única: `key`, `module` (`GENERAL`, `SECURITY`, `NOTIFICATIONS`), `label` e `description` pt-BR, `valueType` (`string`, `int`, `float`, `boolean`, `json`), `defaultValue` já no tipo, `rule` opcional (Zod sobre o valor convertido) e `redactInAudit` opcional. A tabela `system_configs` guarda só `companyId + key → value` (texto); sem linha, vale o padrão.
- **Acrescentar uma chave**: (1) uma entrada no catálogo, junto das chaves do mesmo `module` e na ordem em que a tela deve mostrá-la, com chave `<grupo>.<nomeCamelCase>`; (2) `defaultValue` no tipo do `valueType` (`int` → número: o compilador recusa a mistura) e, se houver, a `rule`, com mensagem pt-BR que não repete o valor; (3) nada a rodar: sem migration nem seed, a chave aparece para toda empresa com o padrão; (4) o teste do catálogo confere que o padrão passa pela própria regra; (5) se o valor pode ser dado pessoal (e-mail ou telefone de uma pessoa) ou sensível, marque `redactInAudit: true`: a trilha de auditoria registra que a chave mudou, com o valor trocado por `[omitido]` (hoje: `app.supportEmail`). Nunca renomeie uma `key` (o valor gravado fica órfão). Endurecer a `rule` não invalida o que já foi gravado: o valor que não passa mais é lido como o padrão (na API e no código) até a empresa gravar de novo. Grupo novo entra em `SYSTEM_CONFIG_MODULES` e precisa de rótulo no frontend.
- **Validação e gravação**: o schema do `PATCH` converte cada `value` pelo `valueType`, aplica a `rule` e entrega ao service o texto normalizado (`'020'` → `'20'`, e-mail em minúsculas, JSON compacto); a mensagem de erro é `<label>: <regra>`. O service faz `upsert` de cada item numa única `prisma.$transaction` interativa, na ordem do catálogo, e relê a lista pelo mesmo `tx`. O primeiro comando da transação é a trava consultiva da empresa (`pg_advisory_xact_lock(hashtext(systemConfigsLockName(companyId)))`): lotes simultâneos da mesma empresa se revezam e cada um lê como "antes" o que o anterior confirmou; empresas diferentes não se esperam. Cada chave que mudou (antes efetivo, o padrão quando não havia linha, diferente do novo) vira um registro `SETTINGS`/`SystemConfig`/`update` com `entityId` = chave; a chave enviada sem mudança não gera registro. O teste da corrida usa `raceAgainstSystemConfigsBatch` de `src/tests/helpers/systemConfigsLock.ts`.
- **Leitura no código**: `getSystemConfigValueService({ companyId, key }, client?)` devolve o valor no tipo do catálogo (`SystemConfigValue<K>`: `security.idleTimeoutMinutes` → `number`). Fora do módulo, não leia `prisma.systemConfig` direto.
- **Timeout de inatividade**: cascata `User.idleTimeoutMinutes` → `security.idleTimeoutMinutes` da empresa → padrão do catálogo (20), em `resolveIdleTimeoutMinutesService`, entregue na sessão. A faixa (1 a 480) é `IDLE_TIMEOUT_MINUTES_RANGE` (`src/config/constants.ts`), a mesma no cadastro do usuário e na configuração.
- **Permissões**: `GET` exige `backoffice.systemConfigs.read`; `PATCH`, `backoffice.systemConfigs.update`.
- Fora do template por ora: tipo `secret` com valor cifrado e configuração global (sem empresa) com herança.

### Trilha de auditoria

Módulo `src/modules/audit/` (rotas `/api/client/audit-logs`, só leitura) e `src/lib/audit/` (contexto da requisição e cura do antes/depois). Toda mudança relevante numa empresa e todo login ficam em `AuditLog`, escopado por `companyId`. Padrão do sul-oxidos, portado para as convenções daqui.

- **Regra**: toda mutação (criar, editar, excluir, mudar status, mudar vínculo) grava `recordAuditService(entradas, tx)` **pelo `tx` da própria escrita**, depois dela e dentro da mesma `prisma.$transaction(async (tx) => ...)` (abra uma se a escrita não tinha). Se a mutação falha, o registro some junto; se a gravação do registro falha, a mutação é desfeita: a trilha nunca diz que algo mudou quando não mudou. Leitura, logout e exportação não são auditados.
- **Entrada** (`AuditEntry`): `companyId`, `module` (`USERS`: cadastro de usuários; `SECURITY`: login, bloqueio, cargos e vínculos; `SETTINGS`: configurações), `entity` (nome do model, tipo `AuditEntity`), `entityId` (a chave, no caso de configuração), `action` (`create`, `update`, `delete`, `statusChange`, `login`), `description`, `before`/`after`. Uma lista de entradas vai numa inserção só (um registro por item do lote).
- **`before`/`after`**: passe a linha inteira (o `select` da consulta) ou o estado que o usuário edita (`toRoleAuditSnapshot`, `toUserRolesAuditSnapshot`). `pickAuditable` tira segredo (`password`, hash, token, segredo, pelo nome do campo) e metadados de linha (`id`, `companyId`, `createdAt`, `updatedAt`, `deletedAt`) e aplaina para primitivos (data vira ISO, lista de primitivos vira `"a, b"`, relação e objeto saem; lista vazia também sai, porque não se distingue de relação vazia). Lista que precisa aparecer vazia como `null` (cargos, permissões) vira texto no estado montado, com `toAuditListText`. `computeChangedFields` deriva `changedFields` (vazio em criação, exclusão e login); campo que só existe de um lado conta como alterado, então a lista de primitivos que fica vazia entra em `changedFields` e a chave sai do `after`. O estado do usuário na trilha é a linha cadastral (`userSelect`, ou `toUserAuditState` da linha do CRUD): `lastLoginAt` e os cargos ficam fora (o último acesso não é mudança feita por alguém; os cargos têm registro próprio). Depois do diff, o valor dos campos pessoais da entidade (`AUDIT_PERSONAL_FIELDS`: `name`, `email`, `phone` e `image` do `User`) e dos `redactedFields` da entrada vira `[omitido]` (`null` continua `null`). Segredo que mudou entra só pelo nome, em `hiddenChangedFields` (ex.: `password` no `PATCH /users/:userId`).
- **`update` sem campo alterado não é gravado**: salvar sem mudar nada, chave de configuração reenviada com o mesmo valor, o mesmo conjunto de cargos.
- **`description`**: frase pt-BR no passado, sem nome, e-mail ou outro dado pessoal e sem o nome do registro: `"Cadastrou um usuário"`, `"Bloqueou um usuário"`, `"Alterou uma configuração"`. O que mudou está em `changedFields` e em `before`/`after`.
- **Autor e metadados**: vêm do contexto da requisição (`@fastify/request-context` sobre `AsyncLocalStorage`, registrado em `app.ts`): `requestId` (o `reqId` do pino), `ip` e `userAgent` (cortado em `AUDIT_USER_AGENT_MAX_LENGTH`) em toda requisição, mais o `userId` que o `requireSession` acrescenta (`setAuditActor`). Só `recordAuditService` lê esse contexto (`getAuditRequestMetadata`); regra de negócio recebe autor, empresa e dados por argumento, nunca daqui. Rota pública (login, register) passa `userId` explícito na entrada. Fora de uma requisição (seed, script) o registro fica sem autor (ação do sistema).
- **"Antes" exato**: leia o estado anterior dentro do `tx`, **depois da trava** que serializa quem escreve o mesmo registro: `SELECT id FROM <tabela> WHERE id = ${id} FOR NO KEY UPDATE` na linha (edição e exclusão de usuário, edição de cargo), a trava da empresa (`lockCompanyAdminsService`) nos vínculos e na exclusão de cargo, a trava consultiva por empresa nos lotes de configuração. Sem ela, duas escritas simultâneas registram o mesmo "antes". `FOR NO KEY UPDATE` é a força do próprio `UPDATE`: não barra quem só insere vínculo apontando para a linha.
- **Eventos gravados**:

  | Mutação | `module` / `entity` / `action` | `entityId` | `before` → `after` |
  | --- | --- | --- | --- |
  | `POST /users` | `USERS` / `User` / `create` | usuário | nada → linha do usuário |
  | `PATCH /users/:userId` | `USERS` / `User` / `update` (campos cadastrais; senha só em `changedFields`) e, se `isActive` mudou, também `SECURITY` / `User` / `statusChange` (`"Bloqueou um usuário"` ou `"Desbloqueou um usuário"`) | usuário | linha → linha, sem `isActive`; `{ isActive }` → `{ isActive }` |
  | `DELETE /users/:userId` | `USERS` / `User` / `delete` | usuário | linha → nada |
  | `PUT /users/:userId/roles` | `SECURITY` / `User` / `update` | usuário | `{ roles }` → `{ roles }` (nomes dos cargos) |
  | `PUT /roles/:roleId/users` | `SECURITY` / `User` / `update`, um registro por usuário que entra ou sai | usuário | `{ roles }` → `{ roles }`, como acima |
  | `POST /roles`, `POST /roles/:roleId/copy` | `SECURITY` / `Role` / `create` | cargo novo | nada → `{ name, description, permissions }` |
  | `PUT /roles/:roleId` | `SECURITY` / `Role` / `update` | cargo | `{ name, description, permissions }` → idem |
  | `DELETE /roles/:roleId` | `SECURITY` / `Role` / `delete` | cargo | `{ name, description, permissions }` → nada |
  | `PATCH /system-configs` | `SETTINGS` / `SystemConfig` / `update`, um registro por chave alterada | chave | `{ value }` → `{ value }` (efetivos; `[omitido]` com `redactInAudit`) |
  | `POST /session/login` (sucesso) | `SECURITY` / `User` / `login`, autor = o próprio usuário (na mesma transação que grava `lastLoginAt`) | usuário | nada |
  | `POST /session/register` | `USERS` / `User` / `create`, autor = o próprio usuário (na mesma transação que grava `lastLoginAt`, que fica fora do `after`) | usuário | nada → linha do usuário |

- **Entidade nova**: acrescente o nome do model em `AUDIT_ENTITIES` (`audit.catalog.ts`); o compilador passa a exigir o rótulo pt-BR em `AUDIT_ENTITY_LABELS` e os campos pessoais em `AUDIT_PERSONAL_FIELDS` (`[]` quando não há). Módulo ou ação nova: valor no enum do `schema.prisma` (migration) e rótulo em `AUDIT_MODULE_LABELS` / `AUDIT_ACTION_LABELS` (o `Record` não compila sem ele). O frontend recebe os rótulos por `GET /audit-logs/options` e mostra o valor cru do que não conhecer.
- **Rotas** (todas com `backoffice.audit.read`): `GET /audit-logs` (paginado 0-based; filtros CSV `module`, `entity`, `action`, `userId`; `entityId` exato; `createdFrom`/`createdTo` ISO UTC inclusivos, por `dateTimeQuerySchema` + `toDateTimeRangeFilter` de `@/lib/http/query`; `search` em descrição, entidade, `entityId` e nome do autor; `orderBy` `createdAt`, `module`, `entity`, `action`, `description`, padrão `createdAt desc`, desempate por `id`) → `{ logs: [{ id, module, entity, entityId, action, description, changedFields, userId, userName, createdAt }], count }`; `GET /audit-logs/options` → `{ modules, actions, entities }`, cada item `{ value, label }`; `GET /audit-logs/:auditLogId` → `{ auditLog: { ...item sem userName, before, after, user: { id, name, email } | null } }`, 404 `"Registro de auditoria não encontrado."` para outra empresa ou inexistente. `requestId`, `ip` e `userAgent` não saem pela API.
- **Índices** de `audit_logs`: `[companyId, createdAt]` (lista padrão; cobre a FK `companyId`), `[companyId, entity, entityId]` (histórico de um registro: a aba "Atividade" filtra `entity=User&entityId=<id>` sem `module`, e o Postgres 17 não faz skip scan, então `module` não entra no meio do índice) e `[userId]` (o que um usuário fez).
- **Nome do autor**: sempre pelo relacionamento com `User` (o nome atual, também de usuário excluído logicamente); o registro nunca guarda cópia. `userId` vira `null` só se o usuário for apagado de verdade (`onDelete: SetNull`).
- **Teste**: toda mutação auditada tem teste em `src/tests/modules/audit/` (registro gravado, nenhum segredo nem dado pessoal no JSON, nada gravado quando a mutação falha).
- Fora do template por ora: índice trigram para a busca textual (quando o volume pedir), política de retenção e anonimização da trilha, auditoria de leitura, logout e exportação.

### Multi-tenant e exclusão lógica

- `Company` é o tenant. `User.companyId` é obrigatório. Toda entidade de negócio nova ganha `companyId` + `@@index([companyId])` e é filtrada por ele nos services. `Role`, `SystemConfig` e `AuditLog` também são por empresa (registro de outra empresa responde 404); só o catálogo `Permission` é global.
- Exclusão é lógica: `deletedAt` + `@@index([deletedAt])`. Leitura filtra `...notDeleted` (de `@/lib/prisma`). Excluir = `update({ deletedAt: new Date() })`, nunca `delete`.
- `email` de usuário continua único após exclusão lógica (decisão do template). Reativar = limpar `deletedAt`.

### Prisma

- Schema em `prisma/schema.prisma`; client gerado em `src/generated/prisma` (`npm run db:generate`, roda no `postinstall`). Importe tipos de `@/generated/prisma/client` (`Prisma.UserWhereInput`, `Prisma.UserSelect`).
- IDs `uuid(7)` (ordenáveis por tempo). Tabelas em `@@map("snake_ou_camel")` plural.
- Migrations: `npm run db:migrate -- --name <descricao>` em dev; `npm run db:deploy` em CI/produção. Nunca edite migration já aplicada.
- Seed idempotente (`upsert`) em `prisma/seed.ts`; dados fictícios.
- Transação: `prisma.$transaction([...])` para leituras em lote; `prisma.$transaction(async (tx) => ...)` para escrita atômica — passe `tx` para os services envolvidos quando precisar (assinatura `client: Prisma.TransactionClient = prisma`).
- Regra que depende de contar linhas ("não pode ficar sem nenhum") checa e escreve na mesma transação, **depois de travar** a linha que agrupa o conjunto (ver **Último administrador**). SQL cru só por template tagueado (`` tx.$queryRaw`... ${valor}` ``), que vira parâmetro; nunca `$queryRawUnsafe` com valor interpolado. Lista vai como um parâmetro só, com o tipo explícito: `` "userId" <> ALL(${ids}::text[]) `` (lista vazia funciona, ao contrário de `NOT IN ()`). Colunas em camelCase entre aspas, tabelas pelo nome do `@@map`.

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

- `POST /api/client/session/login` e `/register` → `{ success, user }`; `POST /session/logout` → `{ success }`; `GET /users/me` → `{ user }`. `user` = `{ id, name, email, image | null, permissions: string[], idleTimeoutMinutes: number }`. 401 em `/users/me` (sem cookie, token inválido ou expirado, usuário excluído) = sem sessão: o frontend vai ao login **sem** toast (silencia só esse status; 5xx e falha de rede mostram o toast). Usuário bloqueado com a sessão aberta recebe 403 `"Conta bloqueada."`: o frontend vai ao login com o toast.
- Login recusado: 401 `"Credenciais inválidas."` (e-mail ou senha) e 403 `"Sua conta está bloqueada."`; o `message` vira o toast. Login e register aceitam 10 tentativas por minuto por IP (`LOGIN_RATE_LIMIT`); acima disso, 429 `"Muitas tentativas. Aguarde um instante e tente novamente."`. O e2e do frontend contra este server (`npm run test:e2e:api` lá) usa 7 logins por execução.
- Falta de permissão numa rota responde **403** `{ message: "Você não possui permissão de acesso." }`.
- Cargos (`/roles` e `PUT /users/:userId/roles`) existem para o backoffice e ainda não são consumidos; o contrato está em `docs/openapi.json` e na seção **Permissões e cargos**.
- Erro sempre com `message` no topo (`extractResponseMessage` do frontend lê `message` plano ou aninhado um nível).
- Sucesso de mutation com `message` → toast automático.
- Listas: `page` 0-based, `pageSize`, `orderBy`, `order`, filtros múltiplos `a,b,c`; resposta `{ <entidades>, count }`.
- Upload: `POST /upload/file` com campo `file`, resposta com `Location`.
- Datas trafegam como ISO 8601 UTC. Data sem hora vai como `AAAA-MM-DD` (coluna `@db.Date`).
- `user.idleTimeoutMinutes` na sessão (login, register, `/users/me`): sempre um número já resolvido (usuário → empresa → 20), no nome que o frontend previu. No CRUD de usuários o mesmo campo é o valor **próprio** do usuário (`number | null`; null herda o da empresa), aceito em `POST /users` e `PATCH /users/:userId` (inteiro de 1 a 480, ou null).
- Usuário no CRUD (`GET /users`, `GET /users/:userId`, `POST /users`, `PATCH /users/:userId`): `user = { id, name, email, image | null, phone | null, isActive, idleTimeoutMinutes | null, lastLoginAt | null, roles: [{ id, name }], createdAt, updatedAt }`. Distinto do `user` da sessão (que não muda: sem `lastLoginAt` nem `roles`). `PUT /users/:userId/roles` devolve o mesmo, com `isSystem` em cada cargo.
  - **Status**: não há campo `status`. O cliente deriva de `isActive` (true "Ativo", false "Bloqueado"); convite (`pending`) não existe. Filtro: `isActive=true|false`.
  - **`lastLoginAt`**: última abertura de sessão (login bem-sucedido ou register), ISO 8601 UTC; `null` = "Nunca acessou" (todo usuário anterior à coluna começa assim, e o criado por `POST /users` até o primeiro login). Gravado pelo login, na transação do registro `login` da trilha, e pelo register, na transação que cria o usuário; não sai na sessão. Não mexe no `updatedAt`, que reflete só edição de cadastro.
  - **`roles`**: cargos que valem (não excluídos, da empresa do usuário), em ordem alfabética do nome; `[]` sem cargo. Mudam só por `PUT /users/:userId/roles` e `PUT /roles/:roleId/users`.
  - Lista: `roleId=<id>,<id>` (usuários com qualquer um dos cargos; cargo de outra empresa não traz ninguém) e `orderBy` ∈ `name | email | createdAt | lastLoginAt` (padrão `name asc`; em `lastLoginAt`, quem nunca acessou fica no fim nos dois sentidos). A busca continua `search` (nome ou e-mail), não `q`.
- Configurações de sistema: `GET /system-configs` → `{ systemConfigs: [{ key, module, label, description, valueType, value }] }`, sem `count`, na ordem do catálogo; `value` é **sempre string**. Gravação em lote atômica por `PATCH /system-configs` com `{ items: [{ key, value }] }`, resposta `{ message: "Configurações atualizadas.", systemConfigs }` (a tela não deve somar um toast próprio). Item inválido responde 400 com `issues` (`path` `items.<i>.value` ou `items.<i>.key`; o `message` do issue começa pelo `label`), e o `message` do topo segue o padrão do projeto, `<path>: <mensagem do primeiro issue>` (ex.: `items.2.value: <label>: Informe um número inteiro.`). A chave é o identificador: não há `id`.
- Auditoria: `GET /audit-logs` → `{ logs, count }` (`page` 0-based, o mesmo índice da `DataTable` do frontend, sem `+ 1`), `GET /audit-logs/options` → `{ modules, actions, entities }` e `GET /audit-logs/:auditLogId` → `{ auditLog }` (envelope por entidade: o frontend desembrulha). `module` ∈ `USERS | SECURITY | SETTINGS`; `action` ∈ `create | update | delete | statusChange | login`; `before`/`after` só com valores primitivos e dado pessoal como `[omitido]`. A aba "Atividade" do usuário é a lista filtrada por `userId` (o que ele fez, índice `[userId]`) ou por `entity=User&entityId=<id>` (o que fizeram com ele, índice `[companyId, entity, entityId]`).
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

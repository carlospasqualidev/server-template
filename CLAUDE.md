# CLAUDE.md

Guia para o Claude trabalhar neste backend. Este arquivo traz as regras gerais e o comportamento esperado, válidos para toda tarefa; as convenções por assunto, o guia de testes, o Definition of Done e os guardrails ficam nos guias de `docs/` (ver **Guias de referência**). Leia o [`README.md`](README.md) para stack, scripts, variáveis de ambiente e como rodar.

> Os templates irmãos `../frontend-template` (web) e `../app-template` (mobile) consomem esta API. O que eles esperam está em **Contrato com os clientes**, no [`docs/conventions.md`](docs/conventions.md#contrato-com-os-clientes-frontend-web-e-app). Não mude formato de resposta, nome de rota ou de campo sem atualizar o consumidor.

---

## Stack

Node 22+ (ESM) • Fastify 5 • TypeScript strict • Zod 4 + `fastify-type-provider-zod` (um schema gera validação, tipo, serialização e OpenAPI) • Prisma 7 (PostgreSQL via driver adapter `pg`) • JWT em cookie HTTP-only (web) ou `Authorization: Bearer` (app nativo) • `@fastify/request-context` (contexto por requisição, só para a trilha de auditoria) • Swagger UI • bcrypt • AWS S3 (upload em stream) • pino • Vitest (unit sem banco e integração com Postgres descartável) • ESLint + Prettier + Husky + lint-staged • Docker Compose (Postgres).

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
3. **Se a decisão vai virar padrão para outros módulos, documente aqui (regra geral) ou no guia de `docs/` do assunto** (ver **Guias de referência**).

Resumo: **consistência interna > inspiração externa > improvisar do zero.**

---

## Guias de referência

O que torna uma tarefa e uma entrega prontas (loop por tarefa, testes que a tarefa exige, documentação, fechamento, como reportar) está em [`docs/definition-of-done.md`](docs/definition-of-done.md); o que nunca se faz sem aval, em [`docs/guardrails.md`](docs/guardrails.md). Os guias abaixo são lidos sob demanda, quando a tarefa toca o assunto (não importe com `@`: o guia entra quando a tarefa chega na área dele).

| Arquivo | Quando ler |
| --- | --- |
| [`docs/definition-of-done.md`](docs/definition-of-done.md) | Antes de dar uma tarefa ou a entrega por pronta; ao reportar o placar |
| [`docs/guardrails.md`](docs/guardrails.md) | Antes de push, MR, commit, mexer em config, rodar comando destrutivo em banco, alterar migration ou desligar verificação |
| [`docs/testing-guide.md`](docs/testing-guide.md) | Antes de escrever ou mudar teste, factory ou helper de `src/tests/`, e antes de mexer no banco de teste |
| [`docs/conventions.md#imports`](docs/conventions.md#imports) e [`#camadas-e-regras-de-import-verificadas-pelo-lint`](docs/conventions.md#camadas-e-regras-de-import-verificadas-pelo-lint) | Ao importar entre camadas ou de outro módulo |
| [`docs/conventions.md#anatomia-de-um-endpoint--checklist-para-criar-um-novo`](docs/conventions.md#anatomia-de-um-endpoint--checklist-para-criar-um-novo) | Antes de criar endpoint, módulo ou tag |
| [`docs/conventions.md#formato-das-respostas`](docs/conventions.md#formato-das-respostas) e [`#paginação-ordenação-e-filtros-contrato-com-a-datatable-do-frontend`](docs/conventions.md#paginação-ordenação-e-filtros-contrato-com-a-datatable-do-frontend) | Antes de definir a resposta de uma rota, listagem, filtro ou ordenação |
| [`docs/conventions.md#sessão-e-autenticação`](docs/conventions.md#sessão-e-autenticação) | Ao mexer em login, register, logout, `requireSession` ou autoatendimento (`/users/me`) |
| [`docs/conventions.md#permissões-e-cargos`](docs/conventions.md#permissões-e-cargos) | Antes de criar permissão ou rota com `requirePermission`, ou mexer em cargos e vínculos |
| [`docs/conventions.md#configurações-de-sistema`](docs/conventions.md#configurações-de-sistema) | Antes de acrescentar, ler ou validar chave de configuração |
| [`docs/conventions.md#trilha-de-auditoria`](docs/conventions.md#trilha-de-auditoria) | Antes de criar endpoint de mutação ou exportação, ou mexer em auditoria e retenção |
| [`docs/conventions.md#multi-tenant-e-exclusão-lógica`](docs/conventions.md#multi-tenant-e-exclusão-lógica) e [`#prisma`](docs/conventions.md#prisma) | Antes de criar entidade, migration, transação ou SQL tagueado |
| [`docs/conventions.md#variáveis-de-ambiente`](docs/conventions.md#variáveis-de-ambiente) | Ao criar ou ler variável de ambiente |
| [`docs/conventions.md#upload`](docs/conventions.md#upload) | Ao mexer em upload ou em campo de URL de imagem |
| [`docs/conventions.md#contrato-com-os-clientes-frontend-web-e-app`](docs/conventions.md#contrato-com-os-clientes-frontend-web-e-app) | Antes de mudar formato de resposta, nome de rota ou de campo que o frontend ou o app consomem |
| [`docs/conventions.md#swagger--openapi`](docs/conventions.md#swagger--openapi) | Ao mexer em `describe()`, tags, segurança no OpenAPI ou no `docs/openapi.json` |

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
- **Não trate validação à mão.** O schema Zod da rota responde 400 com `issues: [{ path, message }]`.
- Erros do Prisma com significado HTTP já são traduzidos (`P2002` → 409, `P2025` → 404, `P2003` → 400). Prefira mesmo assim checar antes (`findUnique` + `ConflictError`) para dar mensagem específica.
- **Erro do roteador** (parâmetro de rota acima de 100 caracteres, o `maxParamLength`; URL com codificação inválida) acontece antes da rota e dos hooks. `frameworkErrorHandler` (`frameworkErrors` em `app.ts`) aplica à mão os cabeçalhos do helmet e do CORS, que não rodam nesse caminho, e delega ao `errorHandler`: 414 `Parâmetro da URL muito longo.` e 400 `URL inválida.`. A mensagem original do Fastify repete o caminho: código novo do roteador entra em `fastifyErrorMessages`, nunca com a mensagem dele.
- Log via `request.log` / `app.log` (pino). `console.*` é erro de lint em `src/` (liberado em `prisma/`, `scripts/`, `src/scripts/` e testes).

---

## Segurança

- **Toda entrada passa pelo schema Zod da rota** (`body`, `querystring`, `params`). Nunca leia `request.body` numa rota sem schema. O único caso especial é multipart (upload), lido como stream no controller.
- **Escopo por empresa (tenant).** Todo service que lê ou escreve dado de negócio recebe `companyId` (de `getAuthenticatedUser(request)`) e filtra por ele. Registro de outra empresa responde **404, nunca 403** — não revelamos que existe.
- **Ordenação e filtro dinâmicos só por allowlist** (`sortQuerySchema([...])`). Nunca interpole nome de coluna vindo da query.
- **Senha**: bcrypt (custo 12), comparada em tempo constante mesmo quando o e-mail não existe. Nunca sai em resposta — `userSelect` não inclui `password`; response schemas descartam campos extras.
- **Sessão** em cookie HTTP-only, `SameSite=Lax`, `Secure` em produção, para a web: ela nunca recebe o token no corpo. O app nativo recebe o JWT no corpo do login e do register **só** com o cabeçalho `X-Client-Type: mobile` (e aí sem cookie), guarda-o no armazenamento seguro do aparelho e o envia em `Authorization: Bearer` (ver **Sessão e autenticação** em [`docs/conventions.md`](docs/conventions.md#sessão-e-autenticação)). Token nunca em query nem em `localStorage`.
- **Rate limit** em login, register e na troca da própria senha (`PUT /users/me/password`, que confere a senha atual), todos com `LOGIN_RATE_LIMIT` (e a mesma opção `loginRateLimitMax` do `buildApp` nos testes). Rotas novas sensíveis (recuperação de senha, envio de e-mail) também recebem `config: { rateLimit }`.
- **Variáveis de ambiente** só em `src/config/env.ts` (validado com Zod). `process.env` fora dali é erro de lint.
- Helmet e CORS por allowlist (`CORS_ORIGINS`) já estão ligados em `app.ts`, inclusive na resposta de erro do roteador, que não passa pelos hooks: ali os cabeçalhos saem do pacote `helmet` (os mesmos do `@fastify/helmet` sem opções; se ele falhar, a resposta sai assim mesmo e a falha vai ao log com `warn`) e de `corsHeadersFor` (`src/config/cors.ts`, espelho das `corsOptions`). Mudou as opções de um dos dois plugins, mude também o espelho. `CORS_ORIGINS` com `*` derruba a subida (`env.ts`): a sessão é cookie (credenciais), e o espelho compara cada origem literalmente. **Métodos liberados** (`methods` em `corsOptions`): `GET`, `HEAD`, `POST`, `PUT`, `PATCH` e `DELETE`, os que a API usa. Sem a lista, o plugin libera só `GET,HEAD,POST` e o navegador barra no preflight toda escrita por `PUT`, `PATCH` e `DELETE`; `OPTIONS` fica de fora porque o preflight não é conferido contra ela. Rota com método novo entra na lista. O espelho não leva `methods`: o cabeçalho só vai no preflight, e o preflight que cai no erro do roteador falha no navegador pelo status. Teste em `src/tests/config/cors.test.ts`.

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
- **O termo de busca é mascarado no log.** O serializador `req` do logger (`serializeRequestForLog`, `src/config/logger.ts`) grava a URL de toda requisição com o valor de cada `search` trocado por `[omitido]` (`/users?page=0&search=[omitido]&orderBy=name`), inclusive com o nome codificado (`%73earch`); o caminho, os demais parâmetros e os outros campos do registro saem como no serializador padrão do Fastify. Só `search` é mascarado. A query começa onde o roteador a lê, no primeiro `?` ou `#` (`/users#search=maria` chega à rota como `search`). A mesma máscara (`maskSearchInUrl`, `maskSearchInText`) vale para a URL enviada ao `ERROR_LOG_URL` e para a mensagem de erro do roteador que repete a URL (`FST_ERR_BAD_URL`, no `warn` do `errorHandler`). URL nova em log ou reporte passa por ela.
- `reportError` envia só `requestId`, método, URL (com a busca mascarada) e **id** do usuário. Mantenha assim.
- Mensagem de erro não ecoa o input: `"E-mail já cadastrado."`, nunca `"O e-mail x@y.com já existe."`.
- Query string nunca leva PII (`?email=` vira log de servidor). Use body em POST. Exceção, por decisão do projeto: `search`, o texto livre das listas (pode ser um nome ou um e-mail), fica na query porque os filtros da lista vivem na URL do frontend, e o logger mascara o valor. Parâmetro novo com PII não entra na query.
- Seeds e factories usam dados fictícios (`@example.com`).
- **Trilha de auditoria** (ver **Trilha de auditoria** em [`docs/conventions.md`](docs/conventions.md#trilha-de-auditoria)): **contém dado pessoal, por decisão do dono.** `before`/`after` guardam os valores de nome, e-mail, telefone e foto (e o que `AUDIT_PERSONAL_FIELDS` marcar em cada entidade) e a `description` nomeia o registro afetado (`Criou o usuário "Maria Alves".`). A base é a finalidade de segurança e prestação de contas (provar quem mudou o quê, de qual valor para qual); por isso a trilha é a exceção à regra de não copiar dado pessoal, e só ela. O que continua proibido: segredo em qualquer campo (`password`, hash, token saem em `pickAuditable`; valor de configuração secreta com `redactInAudit` vira `[omitido]`), e-mail ou telefone na `description` (só o nome do registro) e cópia do nome do autor (vem do relacionamento com `User`). `ip` e `userAgent` são gravados (segurança) e não saem pela API. O de→para (`fieldChanges`) é calculado na leitura a partir de `before`/`after`: mostra os mesmos valores, e o que a anonimização trocou por `[omitido]` sai `[omitido]`. **O dado pessoal da trilha tem prazo** (ver **Retenção** em **Trilha de auditoria**, no [`docs/conventions.md`](docs/conventions.md#trilha-de-auditoria)): passado o prazo da empresa (`audit.anonymizeAfterMonths`, padrão 12 meses) o evento é anonimizado (autor, IP e user-agent nulos, os campos de `AUDIT_PERSONAL_FIELDS`, o termo de busca das exportações e o valor das configurações marcadas `personalData` viram `[omitido]`, a frase vira `genericAuditDescription`) e, passado o segundo (`audit.deleteAfterMonths`, padrão 60), apagado. Pedido de eliminação de um titular: `anonymizeAuditForUserService` anonimiza na hora os eventos em que ele é autor ou alvo.

---

## Performance

- **Listagem sempre paginada** (`paginationQuerySchema`, máx. `MAX_PAGE_SIZE`). Sem `findMany` sem `take`. Exceções: (1) catálogo finito vindo do código: o de permissões (`GET /roles/permissions`) e o de configurações de sistema (`GET /system-configs`, que lê só as chaves do catálogo, no máximo uma linha por chave pelo índice único); (2) consulta limitada pelo tamanho **validado** do corpo: lista de ids com `.max(MAX_BODY_IDS, "<mensagem pt-BR>")` no schema da rota, usada como `id: { in: [...] }` (ou `userId: { in: [...] }`). Lista sem `max` não é limite; (3) consulta limitada pelo que a própria escrita mudou: os ids que um `DELETE ... RETURNING` devolveu. Para o que fica fora da lista do corpo (ex.: quem sai do cargo), nunca leia o conjunto inteiro: apague com `notIn` ou, quando precisar saber quem saiu (trilha de auditoria), com `DELETE ... RETURNING` em SQL tagueado, que apaga e devolve os ids no mesmo comando (referência: `setRoleUsersService`). O custo acompanha a mudança, não o tamanho do conjunto.
- `select` explícito em toda consulta (ver `users.select.ts`). Nunca `include` cego nem devolver a linha inteira.
- `prisma.$transaction([findMany, count])` para lista + total numa ida só (ou dois `$queryRaw`, quando a lista é SQL tagueado).
- **Índices**: toda FK e todo `deletedAt` têm `@@index` no schema. Campo novo usado em `where`/`orderBy` frequente ganha índice na mesma migration.
  - Exceção: **FK que é prefixo (primeira coluna) de um `@@unique` ou `@@index` composto dispensa índice próprio**, porque o composto já atende a busca por ela. Ex.: `Role.companyId` coberto por `@@unique([companyId, name])`, `UserRole.userId` por `@@unique([userId, roleId])`. A FK que não é a primeira coluna (`UserRole.roleId`) continua com `@@index` próprio. Registre no comentário do model qual índice cobre a FK.
  - Coluna que só entra como ordenação ou filtro **opcional** de uma lista já filtrada pelo índice de `companyId` não ganha índice próprio: `name`, `email`, `createdAt` (também o período `createdFrom`/`createdTo`), `lastLoginAt` e `isActive` (filtro e ordenação) de `users`. O índice de `lastLoginAt` ainda custaria uma escrita a mais em todo login. Reavalie quando a ordenação virar padrão ou o volume por empresa pedir.
- Upload é stream (arquivo → S3) sem passar por memória ou disco. Mantenha.
- Custo do bcrypt cai para 4 em teste (`env.isTest`), não mexa em produção.

---

## Git e commits

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`.
- Um commit, uma mudança lógica. Migration entra no mesmo commit da mudança de schema que a gerou.
- Mensagens em inglês, modo imperativo: `add user deactivation endpoint` (não `added`/`adding`).
- PRs pequenos e revisáveis. Se não dá para revisar em 30 min, está grande demais.
- Husky + lint-staged rodam ESLint e Prettier no `pre-commit`. O `pre-push` roda `format:check + typecheck + test` (precisa do Postgres); o CI roda lint, `format:check`, typecheck, test e build. Não pule hooks (`--no-verify`) — se algo quebra, conserte; não bypasse.
- `src/generated/` (client do Prisma) e `dist/` não entram no repositório. `docs/openapi.json` entra.

---

## Estrutura de pastas

```
src/
├── app.ts                  # buildApp(): plugins, compiladores Zod, error handler, rotas. Sem listen.
├── server.ts               # sincroniza o catálogo de permissões, agenda a retenção da auditoria, listen + graceful shutdown (SIGINT/SIGTERM)
├── routes.ts               # árvore /api → /client → módulos; grupo protegido com requireSession
├── config/
│   ├── env.ts              # ÚNICO lugar que lê process.env, validado com Zod
│   ├── constants.ts        # cookie, paginação, limites, rate limit
│   ├── cors.ts · logger.ts · swagger.ts
├── hooks/
│   ├── requireSession.ts   # onRequest das rotas protegidas: Bearer ou cookie → JWT → usuário + permissões → request.user
│   └── requirePermission.ts # preHandler por rota: requirePermission(nome) / requireAnyPermission([nomes]) → 403
├── lib/                    # infraestrutura compartilhada; NÃO importa de modules/
│   ├── prisma.ts           # client único + `notDeleted`
│   ├── errors/             # AppError e filhos, assertExists, errorHandler, reportError
│   ├── http/               # pagination, query (search/boolean/csv/intervalo de datas), responses (erro, message, data), security (`sessionSecurity`: cookie ou Bearer no OpenAPI)
│   ├── validation/         # primitivos Zod pt-BR (email, senha, cpf, cnpj, cep, telefone, URL de imagem, datas)
│   ├── auth/               # password (bcrypt), session (JWT, cookie ou Bearer, openSession), authenticatedUser
│   ├── audit/              # contexto da requisição para a trilha (auditContext), cura do antes/depois (auditSnapshot), corte da retenção (auditRetention)
│   ├── jobs/               # agendamento diário em UTC no processo, preso ao encerramento do app (dailySchedule); quem agenda é o server.ts
│   ├── storage/s3.ts       # client S3 preguiçoso, URL pública, 503 quando não configurado
│   └── format/             # máscaras e unmask pt-BR
├── modules/<módulo>/       # um módulo por recurso de negócio
│   ├── <módulo>.routes.ts  # registra rotas: método, path, schema, handler
│   ├── schemas/            # um arquivo por endpoint: body/query/params + response + rota (tags, summary)
│   ├── controllers/        # um por endpoint: lê request, chama service, responde
│   ├── services/           # um por caso de uso: regra de negócio + Prisma. Único lugar que importa @/lib/prisma
│   └── <módulo>.select.ts  # (opcional) selects Prisma compartilhados pelo módulo
├── scripts/                # linha de comando compilada com a app (roda também na imagem): runAuditRetention.ts
├── generated/prisma/       # client gerado (gitignored)
└── tests/                  # ver docs/testing-guide.md
prisma/
├── schema.prisma · migrations/ · seed.ts
scripts/exportOpenApi.ts    # npm run openapi:export → docs/openapi.json
docs/openapi.json           # contrato gerado; commitado
```

Módulos atuais: `health` (liveness/readiness), `session` (login, register, logout), `users` (CRUD de referência e o autoatendimento em `/users/me`: perfil e troca da própria senha), `upload` (arquivo → S3), `audit` (trilha de auditoria: gravação pelas mutações e exportações, frases por entidade, rótulos de campo e de→para legível, lista com busca por conteúdo, detalhe, linha do tempo de um registro, opções de filtro e retenção: anonimizar e depois apagar, por empresa, e anonimização de um titular), `permissions` (catálogo, sincronização, cargo `Administrador`, permissões efetivas, anti-escalonamento, invariante do último administrador e a trava dela; sem rotas), `roles` (gestão de cargos: catálogo agrupado, CRUD, cópia, usuários do cargo), `systemConfigs` (configurações de sistema por empresa: catálogo no código, leitura, gravação em lote, leitura tipada e a cascata do timeout de inatividade).

---

## Scripts

| Script                   | O que faz                                                          |
| ------------------------ | ------------------------------------------------------------------ |
| `npm run dev`            | API com `tsx` em watch, `.env` carregado pelo Node                 |
| `npm run build`          | `tsc` + `tsc-alias` → `dist/` (ESM com extensões e alias resolvidos) |
| `npm start`              | Roda `dist/server.js`                                              |
| `npm run lint`           | ESLint (camadas, imports, segurança)                               |
| `npm run format`         | Prettier (escrita)                                                 |
| `npm run format:check`   | Prettier (só confere; roda no `check`, no `pre-push` e no CI)      |
| `npm run typecheck`      | `tsc --noEmit`                                                     |
| `npm test`               | Vitest run: projetos `unit` e `integration` (precisa do Postgres)  |
| `npm run test:related`   | Só os testes afetados pelas mudanças não commitadas (`vitest run --changed`) |
| `npm run test:watch`     | Vitest watch                                                       |
| `npm run check`          | Lint + `format:check` + typecheck + test                           |
| `npm run db:up` / `db:down` | Sobe/derruba o Postgres do compose                              |
| `npm run db:migrate -- --name x` | Cria e aplica migration em dev                             |
| `npm run db:deploy`      | Aplica migrations pendentes (CI/produção)                          |
| `npm run db:seed`        | Sincroniza o catálogo de permissões e popula `admin@admin.com` / `123123123` (Administrador) |
| `npm run db:generate`    | Gera o client do Prisma                                            |
| `npm run db:studio`      | Prisma Studio                                                      |
| `npm run openapi:export` | Grava `docs/openapi.json`                                          |
| `npm run audit:retention` | Uma execução da retenção da trilha de auditoria (mesma trava do agendamento do servidor) |
| `npm run clean`          | Remove `dist/`, `coverage/` e o client gerado                      |

---

## Ambiente

- Windows (PowerShell) no dia a dia. Em comandos shell use sintaxe PS (`$env:VAR`, sem `&&` em PS 5.1) — nos scripts npm, `&&` funciona porque roda no shell do npm.
- Node >= 22.12 (`.nvmrc` = 22; CI roda em Node 22). `npm` com `package-lock.json`.
- Postgres via `docker compose` (porta `POSTGRES_PORT`, padrão 5432). Se a 5432 já estiver em uso, `POSTGRES_PORT=5433 npm run db:up` e ajuste `DATABASE_URL` no `.env`; a suíte segue o mesmo servidor (se for local).
- bcrypt é módulo nativo: em Docker use imagem `node:22-slim` (glibc), já configurado no `Dockerfile`.
- A imagem de runtime instala com `npm ci --omit=dev --omit=optional` (sem o CLI do Prisma nem o TypeScript, que o lockfile marca `devOptional`); as migrations rodam pela imagem do estágio `migrate`. Dependência nova com binário nativo opcional (ex.: `sharp`) perde o binário nessa imagem: suba o container para conferir.

---

## 📅 Datas

- Banco: `DateTime` (timestamp UTC) para eventos; `@db.Date` para data civil (nascimento, vencimento).
- Entrada: `dateTimeSchema` (ISO 8601 UTC com `Z`) ou `dateOnlySchema` (`AAAA-MM-DD`) de `@/lib/validation/schemas`. Nunca `z.date()` em body/query.
- Saída: `dateTimeOutputSchema` de `@/lib/http/responses` — aceita o `Date` do Prisma e serializa como ISO. Data civil sai como string `AAAA-MM-DD` (mapeie no service com `toISOString().slice(0, 10)`).
- O servidor não converte fuso: sempre UTC. Formatação para exibição é responsabilidade do cliente, com uma exceção: o de→para da trilha de auditoria (`fieldChanges`) já sai formatado, em UTC (ver **Trilha de auditoria** em [`docs/conventions.md`](docs/conventions.md#trilha-de-auditoria)).

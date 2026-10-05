# CLAUDE.md

Guia para o Claude trabalhar neste backend. Este arquivo traz as regras gerais e o comportamento esperado, válidos para toda tarefa; as convenções por assunto, o guia de testes, o Definition of Done e os guardrails ficam nos guias de `docs/` (ver **Guias de referência**). Leia o [`README.md`](README.md) para stack, scripts, variáveis de ambiente e como rodar.

> Os templates irmãos `../frontend-template` (web) e `../app-template` (mobile) consomem esta API. O que eles esperam está em **Contrato com os clientes**, no [`docs/conventions.md`](docs/conventions.md#contrato-com-os-clientes-frontend-web-e-app). Não mude formato de resposta, nome de rota ou de campo sem atualizar o consumidor.

---

## Stack

Node 22+ (ESM) • Fastify 5 • TypeScript strict • Zod 4 + `fastify-type-provider-zod` (um schema gera validação, tipo, serialização e OpenAPI) • Prisma 7 (PostgreSQL via driver adapter `pg`) • JWT em cookie HTTP-only (web) ou `Authorization: Bearer` (app nativo) • `@fastify/request-context` (contexto por requisição, só para a trilha de auditoria) • Swagger UI • bcrypt • AWS S3 (upload em stream) • pino • Vitest (unit sem banco e integração com Postgres descartável) • ESLint + Prettier + Husky + lint-staged • Docker Compose (Postgres).

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
3. **Se a decisão vai virar padrão para outros módulos, documente-a** no lugar que a seção [**Onde registrar convenção nova**](#onde-registrar-convenção-nova) indica (em **Guias de referência**).

Resumo: **consistência interna > inspiração externa > improvisar do zero.**

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
| [`docs/claude/seguranca-e-http.md`](docs/claude/seguranca-e-http.md) | Antes de mexer em CORS, Helmet, `app.ts`, logger, `reportError`, query string com texto livre, trilha de auditoria ou erro do roteador, e sempre que a tarefa loga um campo ou o manda a log, erro ou reporte. Veio deste arquivo: **Error handling** (erro do roteador), **Segurança** (Helmet, CORS e métodos), **LGPD e dados pessoais (PII)** (máscara do `search`, exceção do `search` na query, trilha de auditoria completa) |
| [`docs/claude/banco-e-desempenho.md`](docs/claude/banco-e-desempenho.md) | Antes de criar entidade ou migration, de adicionar `where`/`orderBy`, de escrever lista sem `take` ou de usar SQL tagueado. Veio deste arquivo: **Performance** (exceções da listagem paginada e `DELETE ... RETURNING`; exceções dos índices) |
| [`docs/claude/estrutura-e-ambiente.md`](docs/claude/estrutura-e-ambiente.md) | Antes de criar pasta, módulo ou camada nova, de procurar um script fora dos do dia a dia, de adicionar dependência nova, de mexer no `Dockerfile` ou de subir o Postgres em outra porta. Veio deste arquivo: **Estrutura de pastas** (árvore e módulos atuais), **Scripts** (tabela completa), **Ambiente** (porta do Postgres, bcrypt no Docker, imagem de runtime) |

### Onde registrar convenção nova

- Convenção de uma área vai para o arquivo dela: o `docs/claude/<área>.md` ou o guia de `docs/` do assunto (tabela acima).
- No `CLAUDE.md` só entra regra que vale para quase toda tarefa, em versão curta; o detalhe fica na área.
- Área nova ganha arquivo novo em `docs/claude/` e uma linha na tabela acima.

## Linguagem de código

- Todo código-fonte em **inglês**. Mensagens para o usuário final (erros, confirmações, `describe()` de campo) em **pt-BR**.
- `camelCase` para variáveis, funções e arquivos. Arquivos nomeados por **verbo + entidade + camada**: `listUsers.controller.ts`, `findUserById.service.ts`, `createUser.schema.ts`.
- Nomes claros e que revelem intenção. Sem abreviações desnecessárias.
  - Prefira: `authenticateUserService`, `listUsersQuerySchema`, `buildPublicFileUrl`
  - Evite: `data`, `info`, `handleThing`, `processStuff`
- Código auto-documentado é melhor que comentário. Comente o **porquê** (regra de negócio, armadilha), não o **o quê**.

## TypeScript

- **Evite `any`** (warning de lint). Use tipos explícitos, genéricos ou `unknown` + narrowing.
- **Sem non-null assertion (`!`)** — é erro de lint. Use `assertExists(valor, "Rótulo")` de `@/lib/errors`, que lança 404 e estreita o tipo.
- Tipos de request derivam do schema: `type LoginBody = z.infer<typeof loginBodySchema>`. Nunca declare o shape à mão.
- `import { type X }` inline para tipos (`verbatimModuleSyntax` está ligado).
- `interface` para shapes de objeto; `type` para uniões e aliases.
- Return type explícito em funções exportadas de `lib/`; nos services a inferência do Prisma é bem-vinda (o `select` define o shape).
- Mantenha o `tsconfig` em `strict` + `noUncheckedIndexedAccess`. Não relaxe flags para "fazer compilar" — conserte o tipo.

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

## Error handling

- **Lance, não responda.** Em service, hook ou controller, lance um `AppError` de `@/lib/errors`: `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `ServiceUnavailableError` (503). Nunca `reply.status(4xx).send(...)` fora do `errorHandler`.
- A resposta de erro é sempre `{ message, details?, issues? }` com `message` em pt-BR pronta para o toast do frontend. Nunca stack, nome de tabela, SQL ou dado pessoal na mensagem.
- Tudo que não é `AppError` vira **500 genérico**, é logado com `request.log.error` e reportado a `ERROR_LOG_URL` (produção). Não engula erro com `catch` vazio; se precisa continuar, logue com `warn`.
- **Não trate validação à mão.** O schema Zod da rota responde 400 com `issues: [{ path, message }]`.
- Erros do Prisma com significado HTTP já são traduzidos (`P2002` → 409, `P2025` → 404, `P2003` → 400). Prefira mesmo assim checar antes (`findUnique` + `ConflictError`) para dar mensagem específica.
- **Erro do roteador** (parâmetro de rota longo demais, URL com codificação inválida) acontece antes da rota e dos hooks e passa por `frameworkErrorHandler`, que repõe os cabeçalhos do helmet e do CORS; a resposta usa a mensagem de `fastifyErrorMessages`, nunca a original do Fastify; detalhe em [`docs/claude/seguranca-e-http.md`](docs/claude/seguranca-e-http.md).
- Log via `request.log` / `app.log` (pino). `console.*` é erro de lint em `src/` (liberado em `prisma/`, `scripts/`, `src/scripts/` e testes).

## Segurança

- **Toda entrada passa pelo schema Zod da rota** (`body`, `querystring`, `params`). Nunca leia `request.body` numa rota sem schema. O único caso especial é multipart (upload), lido como stream no controller.
- **Escopo por empresa (tenant).** Todo service que lê ou escreve dado de negócio recebe `companyId` (de `getAuthenticatedUser(request)`) e filtra por ele. Registro de outra empresa responde **404, nunca 403** — não revelamos que existe.
- **Ordenação e filtro dinâmicos só por allowlist** (`sortQuerySchema([...])`). Nunca interpole nome de coluna vindo da query.
- **Senha**: bcrypt (custo 12), comparada em tempo constante mesmo quando o e-mail não existe. Nunca sai em resposta — `userSelect` não inclui `password`; response schemas descartam campos extras.
- **Sessão** em cookie HTTP-only, `SameSite=Lax`, `Secure` em produção, para a web: ela nunca recebe o token no corpo. O app nativo recebe o JWT no corpo do login e do register **só** com o cabeçalho `X-Client-Type: mobile` (e aí sem cookie), guarda-o no armazenamento seguro do aparelho e o envia em `Authorization: Bearer` (ver **Sessão e autenticação** em [`docs/conventions.md`](docs/conventions.md#sessão-e-autenticação)). Token nunca em query nem em `localStorage`.
- **Rate limit** em login, register e na troca da própria senha (`PUT /users/me/password`, que confere a senha atual), todos com `LOGIN_RATE_LIMIT` (e a mesma opção `loginRateLimitMax` do `buildApp` nos testes). Rotas novas sensíveis (recuperação de senha, envio de e-mail) também recebem `config: { rateLimit }`.
- **Variáveis de ambiente** só em `src/config/env.ts` (validado com Zod). `process.env` fora dali é erro de lint.
- Helmet e CORS por allowlist (`CORS_ORIGINS`, que derruba a subida com `*`) já estão ligados em `app.ts`. Mudou as opções de um dos dois plugins, mude também o espelho do erro do roteador (`corsHeadersFor`, `src/config/cors.ts`); rota com método HTTP novo entra em `methods` de `corsOptions`; detalhe em [`docs/claude/seguranca-e-http.md`](docs/claude/seguranca-e-http.md).

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
- **O termo de busca é mascarado no log** (`serializeRequestForLog`, `maskSearchInUrl`, `maskSearchInText`): só `search` é mascarado, e URL nova em log ou reporte passa pela máscara; detalhe em [`docs/claude/seguranca-e-http.md`](docs/claude/seguranca-e-http.md).
- `reportError` envia só `requestId`, método, URL (com a busca mascarada) e **id** do usuário. Mantenha assim.
- Mensagem de erro não ecoa o input: `"E-mail já cadastrado."`, nunca `"O e-mail x@y.com já existe."`.
- Query string nunca leva PII (`?email=` vira log de servidor). Use body em POST. A única exceção é `search`, mascarado no log; parâmetro novo com PII não entra na query; detalhe em [`docs/claude/seguranca-e-http.md`](docs/claude/seguranca-e-http.md).
- Seeds e factories usam dados fictícios (`@example.com`).
- **Trilha de auditoria** (ver **Trilha de auditoria** em [`docs/conventions.md`](docs/conventions.md#trilha-de-auditoria)): é a única exceção que guarda dado pessoal, por decisão do dono. Limites duros: segredo nunca, em campo nenhum (`password`, hash, token; configuração secreta vira `[omitido]`); e-mail ou telefone nunca na `description` (só o nome do registro) e nunca cópia do nome do autor; `ip` e `userAgent` não saem pela API; o dado pessoal tem prazo (anonimizado e depois apagado, por empresa) e o pedido de eliminação de um titular anonimiza na hora; detalhe em [`docs/claude/seguranca-e-http.md`](docs/claude/seguranca-e-http.md).

## Performance

- **Listagem sempre paginada** (`paginationQuerySchema`, máx. `MAX_PAGE_SIZE`). Sem `findMany` sem `take`; lista de ids do corpo só com `.max(MAX_BODY_IDS, "<mensagem pt-BR>")` no schema da rota. As três exceções e o `DELETE ... RETURNING`: detalhe em [`docs/claude/banco-e-desempenho.md`](docs/claude/banco-e-desempenho.md).
- `select` explícito em toda consulta (ver `users.select.ts`). Nunca `include` cego nem devolver a linha inteira.
- `prisma.$transaction([findMany, count])` para lista + total numa ida só (ou dois `$queryRaw`, quando a lista é SQL tagueado).
- **Índices**: toda FK e todo `deletedAt` têm `@@index` no schema. Campo novo usado em `where`/`orderBy` frequente ganha índice na mesma migration.
  - Exceções (FK que é prefixo de um índice composto; coluna só de ordenação ou filtro opcional de lista já filtrada por `companyId`): detalhe em [`docs/claude/banco-e-desempenho.md`](docs/claude/banco-e-desempenho.md).
- Upload é stream (arquivo → S3) sem passar por memória ou disco. Mantenha.
- Custo do bcrypt cai para 4 em teste (`env.isTest`), não mexa em produção.

## Git e commits

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`.
- Um commit, uma mudança lógica. Migration entra no mesmo commit da mudança de schema que a gerou.
- Mensagens em inglês, modo imperativo: `add user deactivation endpoint` (não `added`/`adding`).
- PRs pequenos e revisáveis. Se não dá para revisar em 30 min, está grande demais.
- Husky + lint-staged rodam ESLint e Prettier no `pre-commit`. O `pre-push` roda `format:check + typecheck + test` (precisa do Postgres); o CI roda lint, `format:check`, typecheck, test e build. Não pule hooks (`--no-verify`) — se algo quebra, conserte; não bypasse.
- `src/generated/` (client do Prisma) e `dist/` não entram no repositório. `docs/openapi.json` entra.

## Estrutura de pastas

Um módulo por recurso de negócio em `src/modules/<módulo>/` (`<módulo>.routes.ts`, `schemas/`, `controllers/`, `services/`, um arquivo por endpoint ou caso de uso). `src/lib/` é infraestrutura compartilhada e **não** importa de `modules/`; o service é o único lugar que importa `@/lib/prisma`; `src/config/env.ts` é o único que lê `process.env`. Árvore completa e módulos atuais: detalhe em [`docs/claude/estrutura-e-ambiente.md`](docs/claude/estrutura-e-ambiente.md).

## Scripts

- Os do dia a dia: `npm run dev`, `npm run check` (lint + `format:check` + typecheck + test), `npm test` (precisa do Postgres), `npm run test:related`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run db:up`, `npm run db:migrate -- --name x`, `npm run db:seed` e `npm run openapi:export`. A tabela completa, com o que cada script faz: detalhe em [`docs/claude/estrutura-e-ambiente.md`](docs/claude/estrutura-e-ambiente.md).

## Ambiente

- Windows (PowerShell) no dia a dia. Em comandos shell use sintaxe PS (`$env:VAR`, sem `&&` em PS 5.1) — nos scripts npm, `&&` funciona porque roda no shell do npm.
- Node >= 22.12 (`.nvmrc` = 22; CI roda em Node 22). `npm` com `package-lock.json`.
- Postgres via `docker compose` (`npm run db:up`); porta ocupada, bcrypt nativo no Docker e a imagem de runtime sem dependências opcionais: detalhe em [`docs/claude/estrutura-e-ambiente.md`](docs/claude/estrutura-e-ambiente.md).
- Dependência nova com binário nativo opcional (ex.: `sharp`) perde o binário na imagem de runtime: suba o container para conferir; detalhe em [`docs/claude/estrutura-e-ambiente.md`](docs/claude/estrutura-e-ambiente.md).

## 📅 Datas

- Banco: `DateTime` (timestamp UTC) para eventos; `@db.Date` para data civil (nascimento, vencimento).
- Entrada: `dateTimeSchema` (ISO 8601 UTC com `Z`) ou `dateOnlySchema` (`AAAA-MM-DD`) de `@/lib/validation/schemas`. Nunca `z.date()` em body/query.
- Saída: `dateTimeOutputSchema` de `@/lib/http/responses` — aceita o `Date` do Prisma e serializa como ISO. Data civil sai como string `AAAA-MM-DD` (mapeie no service com `toISOString().slice(0, 10)`).
- O servidor não converte fuso: sempre UTC. Formatação para exibição é responsabilidade do cliente, com uma exceção: o de→para da trilha de auditoria (`fieldChanges`) já sai formatado, em UTC (ver **Trilha de auditoria** em [`docs/conventions.md`](docs/conventions.md#trilha-de-auditoria)).

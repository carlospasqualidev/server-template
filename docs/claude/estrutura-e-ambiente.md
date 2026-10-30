# Estrutura de pastas, scripts e ambiente

Parte do [`CLAUDE.md`](../../CLAUDE.md), movida de lá sem reescrita: o texto é o mesmo e a versão curta de cada regra continua no núcleo. Leia antes de criar pasta, módulo ou camada nova, de procurar um script fora dos do dia a dia, de adicionar dependência nova, de mexer no `Dockerfile` ou de subir o Postgres em outra porta.

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
├── types/                  # augment de tipos: fastify.d.ts (request.user), requestContext.d.ts (metadados da trilha de auditoria)
└── tests/                  # ver docs/testing-guide.md
prisma/
├── schema.prisma · migrations/ · seed.ts
scripts/exportOpenApi.ts    # pnpm run openapi:export → docs/openapi.json
docs/openapi.json           # contrato gerado; commitado
tsconfig.build.json         # build de produção (pnpm run build): só src/, sem src/tests
```

Módulos atuais: `health` (liveness/readiness), `session` (login, register, logout), `users` (CRUD de referência e o autoatendimento em `/users/me`: perfil e troca da própria senha), `upload` (arquivo → S3), `audit` (trilha de auditoria: gravação pelas mutações e exportações, frases por entidade, rótulos de campo e de→para legível, lista com busca por conteúdo, detalhe, linha do tempo de um registro, opções de filtro e retenção: anonimizar e depois apagar, por empresa, e anonimização de um titular), `permissions` (catálogo, sincronização, cargo `Administrador`, permissões efetivas, anti-escalonamento, invariante do último administrador e a trava dela; sem rotas), `roles` (gestão de cargos: catálogo agrupado, CRUD, cópia, usuários do cargo), `systemConfigs` (configurações de sistema por empresa: catálogo no código, leitura, gravação em lote, leitura tipada e a cascata do timeout de inatividade).

## Scripts

<!-- prettier-ignore -->
| Script                   | O que faz                                                          |
| ------------------------ | ------------------------------------------------------------------ |
| `pnpm run dev`            | API com `tsx` em watch, `.env` carregado pelo Node                 |
| `pnpm run build`          | `tsc` + `tsc-alias` → `dist/` (ESM com extensões e alias resolvidos) |
| `npm start`              | Roda `dist/server.js`                                              |
| `pnpm run lint`           | ESLint (camadas, imports, segurança)                               |
| `pnpm run format`         | Prettier (escrita)                                                 |
| `pnpm run format:check`   | Prettier (só confere; roda no `check`, no `pre-push` e no CI)      |
| `pnpm run typecheck`      | `tsc --noEmit`                                                     |
| `pnpm test`               | Vitest run: projetos `unit` e `integration` (precisa do Postgres)  |
| `pnpm run test:related`   | Só os testes afetados pelas mudanças não commitadas (`vitest run --changed`) |
| `pnpm run test:watch`     | Vitest watch                                                       |
| `pnpm run check`          | Lint + `format:check` + typecheck + test                           |
| `pnpm run db:up` / `db:down` | Sobe/derruba o Postgres do compose                              |
| `pnpm run db:migrate -- --name x` | Cria e aplica migration em dev                             |
| `pnpm run db:deploy`      | Aplica migrations pendentes (CI/produção)                          |
| `pnpm run db:seed`        | Sincroniza o catálogo de permissões e popula `admin@admin.com` / `123123123` (Administrador) |
| `pnpm run db:generate`    | Gera o client do Prisma                                            |
| `pnpm run db:reset`       | Apaga o banco do `.env` e reaplica as migrations (`prisma migrate reset`). **Destrutivo**: só com aval (`docs/guardrails.md`) |
| `pnpm run db:studio`      | Prisma Studio                                                      |
| `pnpm run openapi:export` | Grava `docs/openapi.json`                                          |
| `pnpm run audit:retention` | Uma execução da retenção da trilha de auditoria (mesma trava do agendamento do servidor) |
| `pnpm run clean`          | Remove `dist/`, `coverage/` e o client gerado                      |

## Ambiente

- Postgres via `docker compose` (porta `POSTGRES_PORT`, padrão 5432). Se a 5432 já estiver em uso, `POSTGRES_PORT=5433 pnpm run db:up` e ajuste `DATABASE_URL` no `.env`; a suíte usa `TEST_DATABASE_URL`, se houver, senão o `DATABASE_URL` do `.env` (se for local), senão o Postgres padrão (`src/tests/testDatabase.ts`).
- bcrypt é módulo nativo: em Docker use imagem `node:22-slim` (glibc), já configurado no `Dockerfile`.
- A imagem de runtime instala com `pnpm install --prod --no-optional --ignore-scripts` (sem devDependencies, como o CLI do Prisma e o TypeScript, nem optionalDependencies); as migrations rodam pela imagem do estágio `migrate`. Dependência nova com binário nativo opcional (ex.: `sharp`) perde o binário nessa imagem: suba o container para conferir.

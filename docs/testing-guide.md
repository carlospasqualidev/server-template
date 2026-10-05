# Guia de testes

Guia de referência movido do `CLAUDE.md`: leia antes de escrever ou mudar teste, factory ou helper de `src/tests/`, e antes de mexer no banco de teste. O que torna a tarefa e a entrega prontas (comandos do loop, testes que a tarefa exige, fechamento com `npm run check`, placar) está em [`definition-of-done.md`](definition-of-done.md).

## Dois projetos: unit e integração

O `vitest.config.ts` tem dois projetos, e **o nome do arquivo decide** em qual cada teste cai:

| Projeto | Arquivos | Banco | Arquivos em paralelo |
| --- | --- | --- | --- |
| `unit` | `src/tests/**/*.unit.test.ts` | nenhum: sem `globalSetup` nem `setup.ts`, não cria banco nem roda `migrate` | sim |
| `integration` | todo outro `src/tests/**/*.test.ts` | banco temporário da execução, reset antes de cada teste | não (em série) |

- **Regra**: teste que não consulta o banco, nem pelo que importa e executa, é `<nome>.unit.test.ts` (função pura, schema Zod, `loadEnv(source)`, catálogo em código, `buildApp()` com `inject()` em rota que não lê o banco). O resto é `<nome>.test.ts`. Na dúvida, `.test.ts`: o projeto de integração roda qualquer teste, só mais devagar.
- No `unit`, o `DATABASE_URL` aponta para uma porta fechada (`UNIT_TEST_DATABASE_URL`, em `src/tests/testEnv.ts`): teste unit que consultar o banco falha com conexão recusada em vez de passar por acaso. Renomeie-o para `.test.ts`.
- `npm test` roda os dois projetos (ao mesmo tempo, cada um com a sua regra de paralelismo); `npx vitest run --project unit` roda só os unit.
- Rodar só arquivos unit (`npx vitest run src/tests/lib/format/mask.unit.test.ts`) não cria banco: o `globalSetup` é do projeto de integração e só roda quando a execução tem arquivo dele.

## Banco de teste (projeto de integração)

Integração real com Vitest + `app.inject()` contra um Postgres descartável. Sem mock de banco, sem porta HTTP, sem Docker dentro do teste.

- Banco de teste: **um banco temporário por execução**, `temporary-int-<AAAAMMDDhhmmss UTC>-<aleatório>`. O `globalSetup` apaga os `temporary-int-*` com mais de 6 h (órfãos de execução morta; os recentes podem ser de outra em curso), cria o seu, roda `migrate deploy` e entrega a URL aos workers (`provide`/`inject`, aplicada por `temporaryDatabaseEnv.ts`, primeiro import do `setup.ts`); o teardown o apaga com `DROP DATABASE ... WITH (FORCE)`, com a suíte verde ou vermelha. Duas execuções simultâneas (worktrees, agentes, e2e do frontend) não colidem. O reset e o `DROP` só rodam em banco com o prefixo `temporary-int-` (ver `src/tests/setup.ts`).
- **Reset antes de cada teste** (`resetDatabase`, em `src/tests/setup.ts`): todo teste começa do mesmo estado, com as tabelas de negócio vazias e o catálogo de permissões igual ao do código (como depois do seed).
  - As tabelas de negócio (`BUSINESS_TABLES`) são esvaziadas com `DELETE`, filha antes da mãe, num comando só: ~3 ms por teste, contra ~40 ms do reset anterior (`TRUNCATE` das 8 tabelas e sincronização do catálogo). **Tabela nova entra em `BUSINESS_TABLES`, antes das tabelas que ela referencia.** Esquecida, o `DELETE` da tabela mãe falha por FK no teste seguinte, em vez de vazar dado entre testes.
  - O catálogo (`permissions`) não é apagado a cada teste: o reset o confere (uma leitura, ~1 ms) e só o refaz do zero (apaga e roda `syncPermissionCatalogService()`) quando ele diverge do código: no primeiro teste da execução, com o banco recém-migrado, ou depois de um teste que o alterou de propósito (sincronização com catálogo próprio, permissão criada, apagada ou com metadado trocado). Teste que mexe no catálogo não precisa restaurá-lo.
  - Prova em `src/tests/config/resetDatabase.test.ts`.
- Os arquivos de integração rodam em série, num banco só, e são quase todo o tempo do `npm test`. Paralelizá-los (um banco por worker) é o próximo passo se a suíte voltar a pesar.
- **Só Postgres local**: o servidor vem de `TEST_DATABASE_URL` (CI), senão do `DATABASE_URL` do arquivo `.env`, senão `localhost:5432` (o do compose); o nome do banco da URL é ignorado. A URL final é recusada, antes de qualquer conexão, se o host não for `localhost`, `127.0.0.1` ou `::1` (o nome `postgres` do compose também é recusado: fora da rede do compose ele pode resolver para um servidor remoto), ou se tiver `?host=`/`?hostaddr=`. Sem flag de escape. Um `.env` remoto (RDS) é ignorado com aviso de uma linha e a suíte cai no `localhost:5432`. Regras e testes em `src/tests/testDatabase.ts` e `src/tests/config/testDatabase.unit.test.ts`.
- Ambiente sintético em `src/tests/testEnv.ts`: independente do `.env` local; o `DATABASE_URL` do shell é ignorado de propósito.
- O `migrate deploy` por execução custa ~1,5 s nesta suíte; banco-modelo (`CREATE DATABASE ... TEMPLATE`) só vale a pena se passar de ~10 s.

## Testes relacionados: `npm run test:related`

`npm run test:related` (`vitest run --changed`) é o comando padrão do loop por tarefa (ver [`definition-of-done.md`](definition-of-done.md#loop-por-tarefa)). Ele pega pelo git os arquivos alterados e não commitados (os novos, não rastreados, inclusive) e segue o grafo de imports de cada projeto: roda os testes desses arquivos e os de quem os importa, direta ou indiretamente, unit e integração. Mexer em `src/lib/format/mask.ts` roda só `mask.unit.test.ts`; mexer em `src/lib/audit/auditRetention.ts` roda o teste unit dele e o de integração da retenção, que o importa pelo service.

- **Roda a suíte inteira** quando muda `vitest.config.ts`, um `package.json`, `prisma/schema.prisma`, uma migration (`prisma/migrations/`) ou um arquivo da raiz de `src/tests/` (`setup.ts`, `globalSetup.ts`, `testEnv.ts`, `testDatabase.ts`, `temporaryDatabaseEnv.ts`): é o `forceRerunTriggers` do `vitest.config.ts`. Schema e migration não estão no grafo de imports: sem a regra, mudança só de banco rodaria 0 testes. Arquivo novo na raiz de `src/tests/` entra na regra sozinho.
- **Sem mudança não commitada**, não roda nada: sai com exit 0 e `No test files found, exiting with code 0`. Isso não é verde nem placar. Depois do commit, use `npx vitest related --run <arquivos>`, que segue o mesmo grafo a partir dos arquivos dados.
- Funciona igual no PowerShell e no Git Bash. Para iterar num teste só, `npx vitest run <caminho>` e `npx vitest run -t "<nome do teste>"` continuam valendo.

## Organização dos arquivos

- Todos os testes vivem em [`src/tests/`](../src/tests), importados via alias `@/`:

```
src/tests/
├── setup.ts                       # só integração: reset antes de cada teste (DELETE das tabelas de negócio; catálogo conferido e refeito se divergir), $disconnect no fim
├── globalSetup.ts                 # só integração: apaga órfãos, cria o banco temporário, roda migrate deploy; teardown apaga o banco
├── testDatabase.ts                # trava de host local, resolução do servidor, nome e idade dos bancos `temporary-int-*`
├── temporaryDatabaseEnv.ts        # aponta DATABASE_URL do worker para o banco temporário (primeiro import do setup.ts)
├── testEnv.ts                     # ambiente sintético dos dois projetos; UNIT_TEST_DATABASE_URL, a porta fechada do projeto unit
├── helpers/
│   ├── app.ts                     # createTestApp(options) → app pronto para inject()
│   ├── session.ts                 # sessionCookiesFor(userId) → cookie válido, bearerHeadersFor(userId) → `Authorization: Bearer` válido, sem passar pelo login
│   ├── factories.ts               # createCompany(), createRole({...}), findAdminRole(companyId), createUser({...}), findPermissionIds([...]), findRolePermissionNames(roleId), createSystemConfig({ companyId, key, value }), createAuditLog({...}), findAuditLogs(companyId)
│   ├── companyAdminsLock.ts       # raceAgainstAdminChange({...}) → corrida contra a trava da empresa (último administrador, vínculo x exclusão de cargo), determinística
│   ├── permissionCatalogLock.ts   # raceAgainstCatalogSync({...}) → operação concorrente a uma sincronização do catálogo, determinística
│   ├── systemConfigsLock.ts       # raceAgainstSystemConfigsBatch({...}) → lote de configurações concorrente a outro da mesma empresa, determinístico
│   ├── clock.ts                   # withFrozenDate(now, run) → só o `Date` da aplicação parado (timers, banco e rede reais)
│   └── multipart.ts               # buildMultipartBody([...]) para upload
├── modules/<módulo>/<endpoint>.test.ts
├── hooks/<hook>.test.ts
├── config/<arquivo>.test.ts       # preflight do CORS (`cors.test.ts`), reset do banco (`resetDatabase.test.ts`); unit: validação do ambiente (`env.unit.test.ts`, `loadEnv(source)`), banco de teste (`testDatabase.unit.test.ts`) e busca mascarada no log (`logger.unit.test.ts`)
└── lib/<grupo>/<arquivo>.test.ts
```

Os arquivos sem banco, em qualquer pasta, levam `.unit.test.ts` (ex.: `lib/format/mask.unit.test.ts`, `modules/permissions/permissionCatalog.unit.test.ts`); a pasta continua sendo a do código testado.

## Como escrever os testes

- **Permissões nos testes**: `createCompany()` cria a empresa com o cargo `Administrador` (como o register). `createUser()` sem `permissions` recebe esse cargo, com o catálogo inteiro; `permissions: []` cria o usuário sem cargo; `permissions: ["backoffice.users.read"]` cria um cargo só com essas; `roleIds` vincula cargos já criados (`createRole`). Teste de 403 usa um usuário com todas as permissões menos a exigida.

- Os testes que toda tarefa exige (endpoint novo, mutação nova, exportação nova) estão em **Testes que a tarefa exige**, no [`definition-of-done.md`](definition-of-done.md#testes-que-a-tarefa-exige).
- Teste o caminho de falha, não só o feliz. Asserte a mensagem pt-BR: ela é contrato com o frontend.
- S3 é mockado com `aws-sdk-client-mock` (`mockClient(S3Client)`); nenhum teste faz rede.
- Factories em `helpers/factories.ts`; não escreva `prisma.user.create` gigante inline.
- Um `createTestApp()` por arquivo (`beforeAll`) e `app.close()` no `afterAll`. Para opções diferentes (ex.: rate limit), crie um segundo app dentro do teste e feche-o.

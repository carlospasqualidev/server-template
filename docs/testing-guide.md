# Guia de testes

Guia de referência movido do `CLAUDE.md`: leia antes de escrever ou mudar teste de integração, factory ou helper de `src/tests/`, e antes de mexer no banco de teste. O que torna a tarefa e a entrega prontas (comandos do loop, testes que a tarefa exige, fechamento com `npm run check`, placar) está em [`definition-of-done.md`](definition-of-done.md).

## Camada e banco de teste

Uma camada só: **integração real** com Vitest + `app.inject()` contra um Postgres descartável. Sem mock de banco, sem porta HTTP, sem Docker dentro do teste.

- Banco de teste: **um banco temporário por execução**, `temporary-int-<AAAAMMDDhhmmss UTC>-<aleatório>`. O `globalSetup` apaga os `temporary-int-*` com mais de 6 h (órfãos de execução morta; os recentes podem ser de outra em curso), cria o seu, roda `migrate deploy` e entrega a URL aos workers (`provide`/`inject`, aplicada por `temporaryDatabaseEnv.ts`, primeiro import do `setup.ts`); o teardown o apaga com `DROP DATABASE ... WITH (FORCE)`, com a suíte verde ou vermelha. Duas execuções simultâneas (worktrees, agentes, e2e do frontend) não colidem. `TRUNCATE` e `DROP` só rodam em banco com o prefixo `temporary-int-` (ver `src/tests/setup.ts`). **Tabela nova entra na lista do `TRUNCATE`.** Depois do `TRUNCATE`, o `setup.ts` roda `syncPermissionCatalogService()`: todo teste começa com o catálogo de permissões no banco.
- **Só Postgres local**: o servidor vem de `TEST_DATABASE_URL` (CI), senão do `DATABASE_URL` do arquivo `.env`, senão `localhost:5432` (o do compose); o nome do banco da URL é ignorado. A URL final é recusada, antes de qualquer conexão, se o host não for `localhost`, `127.0.0.1` ou `::1` (o nome `postgres` do compose também é recusado: fora da rede do compose ele pode resolver para um servidor remoto), ou se tiver `?host=`/`?hostaddr=`. Sem flag de escape. Um `.env` remoto (RDS) é ignorado com aviso de uma linha e a suíte cai no `localhost:5432`. Regras e testes em `src/tests/testDatabase.ts` e `src/tests/config/testDatabase.test.ts`.
- Ambiente sintético em `src/tests/testEnv.ts`: independente do `.env` local; o `DATABASE_URL` do shell é ignorado de propósito.
- O `migrate deploy` por execução custa ~1,5 s nesta suíte; banco-modelo (`CREATE DATABASE ... TEMPLATE`) só vale a pena se passar de ~10 s.

## Organização dos arquivos

- Todos os testes vivem em [`src/tests/`](../src/tests), importados via alias `@/`:

```
src/tests/
├── setup.ts                       # TRUNCATE + sincronização do catálogo de permissões antes de cada teste, $disconnect no fim
├── globalSetup.ts                 # apaga órfãos, cria o banco temporário, roda migrate deploy; teardown apaga o banco
├── testDatabase.ts                # trava de host local, resolução do servidor, nome e idade dos bancos `temporary-int-*`
├── temporaryDatabaseEnv.ts        # aponta DATABASE_URL do worker para o banco temporário (primeiro import do setup.ts)
├── testEnv.ts
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
├── config/<arquivo>.test.ts       # validação do ambiente (`loadEnv(source)`), banco de teste (`testDatabase.test.ts`), preflight do CORS (`cors.test.ts`) e busca mascarada no log (`logger.test.ts`)
└── lib/<grupo>/<arquivo>.test.ts
```

## Como escrever os testes

- **Permissões nos testes**: `createCompany()` cria a empresa com o cargo `Administrador` (como o register). `createUser()` sem `permissions` recebe esse cargo, com o catálogo inteiro; `permissions: []` cria o usuário sem cargo; `permissions: ["backoffice.users.read"]` cria um cargo só com essas; `roleIds` vincula cargos já criados (`createRole`). Teste de 403 usa um usuário com todas as permissões menos a exigida.

- Os testes que toda tarefa exige (endpoint novo, mutação nova, exportação nova) estão em **Testes que a tarefa exige**, no [`definition-of-done.md`](definition-of-done.md#testes-que-a-tarefa-exige).
- Teste o caminho de falha, não só o feliz. Asserte a mensagem pt-BR: ela é contrato com o frontend.
- S3 é mockado com `aws-sdk-client-mock` (`mockClient(S3Client)`); nenhum teste faz rede.
- Factories em `helpers/factories.ts`; não escreva `prisma.user.create` gigante inline.
- Um `createTestApp()` por arquivo (`beforeAll`) e `app.close()` no `afterAll`. Para opções diferentes (ex.: rate limit), crie um segundo app dentro do teste e feche-o.

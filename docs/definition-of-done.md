# Definition of Done

Fonte única do que torna uma tarefa e uma entrega prontas neste backend. Termos: _tarefa_ é o card, a unidade de trabalho; _entrega_ é o ticket inteiro, com todas as suas tarefas. O _loop por tarefa_ roda a cada mudança e a cada rodada de correção; o _fechamento_ roda uma vez por entrega, depois da última tarefa, não por tarefa nem por rodada de correção. O que nunca se faz sem aval está em [`guardrails.md`](guardrails.md); como escrever os testes, em [`testing-guide.md`](testing-guide.md).

## Loop por tarefa

Escopado no que a mudança tocou. Tudo verde antes de passar adiante; erro que não dá para corrigir no escopo vira pendência reportada, não "pronto".

1. **Typecheck**: `npm run typecheck` (`tsc --noEmit`, cobre o projeto inteiro: `src/` com os testes, `prisma/` e `scripts/`).
2. **Lint** dos arquivos tocados: `npx eslint <arquivos ou pastas>` (ex.: `npx eslint src/modules/users`). O `npm run lint` roda o projeto todo.
3. **Formato** dos arquivos tocados: `npx prettier --write <arquivos>` (o `pre-commit` já faz isso pelo `lint-staged`; o `check` do fechamento confere com `format:check`). O `CLAUDE.md` e os guias de `docs/` ficam no `.prettierignore`: são formatados à mão.
4. **Testes de integração da área tocada**, com o Postgres no ar (`npm run db:up`): `npx vitest run <caminho>` filtra por arquivo ou pasta de teste (ex.: `npx vitest run src/tests/modules/users`); `npx vitest run -t "<nome do teste>"` filtra por nome. Cada execução, mesmo filtrada, cria e apaga o próprio banco temporário (ver [`testing-guide.md`](testing-guide.md#camada-e-banco-de-teste)). Comportamento novo ganha teste junto (abaixo).
5. **Documentação acompanha a mudança** (abaixo).

### Testes que a tarefa exige

- **Todo endpoint novo tem teste** cobrindo: happy path (status + shape da resposta), validação (400 com `issues`), sem sessão (401), sem a permissão exigida (403), registro de outra empresa (404) e cada regra de negócio (409, 403, mensagem). Filtro e ordenação exigem **dado**: semeie registros que entram e que ficam de fora e asserte os dois lados.
- **Toda mutação nova tem teste do registro de auditoria** (`findAuditLogs(companyId)`): o registro gravado (módulo, entidade, ação, `description` com o nome do registro, `before`/`after` com os valores, pessoais inclusive, `changedFields`, autor), nenhum segredo no JSON (senha, hash) e nenhum registro quando a mutação falha. Toda rota de exportação nova tem teste do registro `export` (formato e filtros). Os testes da trilha ficam em `src/tests/modules/audit/`.

### Documentação acompanha a mudança

**SEMPRE** que você mexer em algo que impacte o **funcionamento** ou o **contrato** da API (rota nova, campo novo, mudança de formato, regra, mensagem visível), **atualize a documentação correspondente na mesma mudança**. Documentação divergente do código é pior que documentação inexistente.

- **Contrato HTTP** → os schemas Zod da rota são a doc. Preencha `summary`, `description`, `tags` e `describe()` nos campos. Depois rode `npm run openapi:export` e commite [`docs/openapi.json`](openapi.json) atualizado: o frontend e o app leem esse arquivo.
- **Convenção que vai se repetir → registre no `CLAUDE.md` (regra geral) ou no guia de `docs/` do assunto.**
- **Como rodar, script novo, variável de ambiente nova → `README.md`** e `.env.example`.
- Só é dispensável quando a mudança **não afeta o uso** (refactor interno, teste, tooling).

## Fechamento

Uma vez por entrega, depois da última tarefa; não por tarefa nem por rodada de correção. Bloqueia o "pronto": `npm run check` ou `npm run build` com falha; teste vermelho, ou pulado ou focado (`it.skip`/`only`, `describe.skip`/`only`) deixado no código; regra, lint ou teste desligado para ficar verde (ver [`guardrails.md`](guardrails.md)); comportamento novo sem teste; contrato HTTP mudado sem `docs/openapi.json` regenerado.

1. **`npm run check` completo** (lint + formato do Prettier + typecheck + test) verde, com o Postgres no ar (`npm run db:up`). Obrigatório ao fechar **qualquer** entrega que toque `src/`, **com o resultado reportado** (ex.: "check verde, 74/74"; ver **Como reportar**).
2. **`npm run build`** (`tsc` + `tsc-alias` → `dist/`) verde.

Uma entrega **não está pronta** com teste vermelho ou sem teste para o comportamento novo.

## Como reportar

Placar medido, não estimado, no formato curto:

- `check N/N`: testes passando sobre o total da linha `Tests` do `npm run check`, com lint, formato e typecheck verdes (ex.: `check 74/74`).
- `build ok`, ou o erro em uma linha.
- No loop, dizer qual filtro rodou (`npx vitest run <caminho>`, `npx eslint <arquivos>`).
- O que foi verificado à mão (a rota no Swagger em `/docs`, o diff do `docs/openapi.json`), em uma linha.
- Falha que ficou: o erro em uma linha, como pendência.

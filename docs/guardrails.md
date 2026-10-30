# Guardrails

O que nenhum agente faz sem aval explícito da pessoa dona do repositório. Vale em qualquer tarefa, inclusive para "ficar verde" ou "destravar" uma verificação. As regras de segurança de código (validação com Zod, escopo por empresa, sessão em cookie HTTP-only ou `Authorization: Bearer`, object injection, LGPD e PII) estão na seção [Segurança](../CLAUDE.md#segurança) do `CLAUDE.md` e não se repetem aqui; o que torna uma tarefa e uma entrega prontas está em [`definition-of-done.md`](definition-of-done.md).

## Sem aval, não se faz

- **Push** de qualquer branch.
- **Abrir merge request / pull request.**
- **Editar `.claude/settings.json`** (permissões e hooks do agente).
- **Commitar `.env` ou segredo** (`JWT_SECRET`, senha do `DATABASE_URL`, `AWS_SECRET_ACCESS_KEY`). O `.gitignore` cobre `.env` e `.env.*` (o `.env.example` fica de fora de propósito) e `.claude/settings.local.json`; não force a inclusão. Segredo em arquivo com outro nome (credencial da AWS, dump de banco) **não** está coberto e nunca se commita. O `.env.example` leva só nomes e valores fictícios.
- **Apontar o teste para um banco que não seja local.** A suíte cria, esvazia e apaga bancos; a trava de host recusa, antes de qualquer conexão, a URL cujo host não seja `localhost`, `127.0.0.1` ou `::1` (ver **Banco de teste** em [`testing-guide.md`](testing-guide.md#banco-de-teste-projeto-de-integração)). A trava não tem flag de escape, e não se edita nem se contorna.
- **Comando destrutivo em banco que não seja o temporário de teste** (`temporary-int-*`): `pnpm run db:reset`, `prisma migrate reset`, `DROP`, `TRUNCATE` ou `DELETE` em massa no banco do `.env`, local ou remoto. Os de teste a suíte cria e apaga sozinha.
- **Alterar migration já aplicada** (ver [Prisma](conventions.md#prisma) em `conventions.md`). Mudança de schema entra numa migration nova.
- **Desligar teste, lint ou regra para ficar verde**: apagar ou enfraquecer teste, `eslint-disable` (inclusive o aviso de object injection), relaxar o `tsconfig`, pular hooks com `--no-verify`.
- **Deixar `it.skip`/`it.only`** (ou `describe.skip`/`only`, `test.skip`/`only`) no código.

## Quando o aval falta

Pare naquele ponto, entregue o que não depende dele e reporte o que precisa de aval, com o motivo em uma linha.

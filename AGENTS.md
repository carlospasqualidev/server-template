# AGENTS.md

As instruções para agentes de código (Claude Code, Codex e afins) estão em [`CLAUDE.md`](CLAUDE.md). Leia esse arquivo antes de escrever qualquer código: ele traz as regras que valem para toda tarefa (TypeScript, contrato de erro, segurança, estrutura) e, em **Guias de referência**, quando ler cada guia de `docs/`: camadas, convenções de módulo, paginação e sessão em [`docs/conventions.md`](docs/conventions.md), testes em [`docs/testing-guide.md`](docs/testing-guide.md), o Loop por tarefa e o Fechamento da entrega em [`docs/definition-of-done.md`](docs/definition-of-done.md) e o que não se faz sem aval em [`docs/guardrails.md`](docs/guardrails.md).

Atalhos:

- Como rodar, scripts e variáveis de ambiente: [`README.md`](README.md).
- Contrato HTTP atual, gerado dos schemas Zod: [`docs/openapi.json`](docs/openapi.json) (regenere com `pnpm run openapi:export`).
- Módulo de referência para CRUD: `src/modules/users/`.

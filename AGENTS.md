# AGENTS.md

As instruções para agentes de código (Claude Code, Codex e afins) estão em [`CLAUDE.md`](CLAUDE.md). Leia esse arquivo antes de escrever qualquer código: ele define camadas, convenções de módulo, contrato de erro, paginação, sessão e a regra de rodar a suíte antes de dar uma tarefa por pronta.

Atalhos:

- Como rodar, scripts e variáveis de ambiente: [`README.md`](README.md).
- Contrato HTTP atual, gerado dos schemas Zod: [`docs/openapi.json`](docs/openapi.json) (regenere com `npm run openapi:export`).
- Módulo de referência para CRUD: `src/modules/users/`.

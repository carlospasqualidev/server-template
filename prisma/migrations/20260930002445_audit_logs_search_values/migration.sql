-- Busca por conteudo com todos os ramos indexaveis. O `search` de `GET /audit-logs` procura o termo na descricao, no
-- id do registro, nos valores de `before`/`after`, na entidade (resolvida no codigo contra o catalogo) e no autor
-- (ids resolvidos antes, pelo nome): cada ramo tem indice, e o Postgres combina os indices (`BitmapOr`) em vez de
-- varrer as linhas da empresa.
--
-- SQL escrito a mao (gerado com `--create-only` e completado). O indice de `entityId` tambem esta no `schema.prisma`
-- (`@@index(..., type: Gin)`). Os de `before`/`after` sao indices de expressao, que o Prisma nao modela nem
-- introspecta: existem so aqui, e o `migrate dev` nao tenta remove-los.
--
-- Os indices de `before`/`after` passam do JSON inteiro (`before::text`, que inclui o nome das chaves: buscar "email"
-- trazia todo evento de usuario) para so os valores, sem os nulos:
-- `{"name": "Ana", "email": "ana@example.com", "image": null}` vira `["Ana", "ana@example.com"]`.
-- `jsonb_path_query_array` e imutavel, requisito de indice de expressao. A consulta repete a expressao igual.

-- DropIndex (expressao do JSON inteiro, substituida pela dos valores)
DROP INDEX "audit_logs_before_trgm_idx";

-- DropIndex (expressao do JSON inteiro, substituida pela dos valores)
DROP INDEX "audit_logs_after_trgm_idx";

-- CreateIndex (expressao, fora do schema.prisma)
CREATE INDEX "audit_logs_before_values_trgm_idx" ON "audit_logs"
  USING GIN ((jsonb_path_query_array("before", '$.* ? (@ != null)')::text) gin_trgm_ops);

-- CreateIndex (expressao, fora do schema.prisma)
CREATE INDEX "audit_logs_after_values_trgm_idx" ON "audit_logs"
  USING GIN ((jsonb_path_query_array("after", '$.* ? (@ != null)')::text) gin_trgm_ops);

-- CreateIndex
CREATE INDEX "audit_logs_entityId_trgm_idx" ON "audit_logs" USING GIN ("entityId" gin_trgm_ops);

-- Busca por conteudo na trilha de auditoria: o `search` de `GET /audit-logs` faz `ILIKE '%termo%'` na descricao e no
-- texto de `before`/`after` (JSONB convertido a texto). O `pg_trgm` com indice GIN torna esse `ILIKE` indexavel; sem
-- ele, cada busca converte e varre o JSON de todas as linhas da empresa.
--
-- SQL escrito a mao. O indice de `description` tambem esta no `schema.prisma` (`@@index(..., type: Gin)`), para o
-- `prisma migrate dev` nao o ver como divergencia. Os de `(before::text)` e `(after::text)` sao indices de expressao,
-- que o Prisma nao modela nem introspecta: existem so aqui, e o `migrate dev` nao tenta remove-los.
--
-- `IF NOT EXISTS` na extensao: um banco de producao pode ja te-la instalada (ela e do banco, nao da tabela).

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "audit_logs_description_trgm_idx" ON "audit_logs" USING GIN ("description" gin_trgm_ops);

-- CreateIndex (expressao, fora do schema.prisma)
CREATE INDEX "audit_logs_before_trgm_idx" ON "audit_logs" USING GIN (("before"::text) gin_trgm_ops);

-- CreateIndex (expressao, fora do schema.prisma)
CREATE INDEX "audit_logs_after_trgm_idx" ON "audit_logs" USING GIN (("after"::text) gin_trgm_ops);

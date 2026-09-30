import { type AuditAction, type AuditModule, Prisma } from "@/generated/prisma/client";
import { toSkipTake } from "@/lib/http/pagination";
import { toContainsLikePattern } from "@/lib/http/query";
import { prisma } from "@/lib/prisma";
import { AUDIT_ENTITIES, AUDIT_ENTITY_LABELS, type AuditEntity } from "@/modules/audit/audit.catalog";
import { type AuditLogSortField, type ListAuditLogsQuery } from "@/modules/audit/schemas/listAuditLogs.schema";

interface ListAuditLogsInput {
  companyId: string;
  query: ListAuditLogsQuery;
}

/** Linha da listagem, no formato de `auditLogListItemSchema`. `requestId`, `ip` e `userAgent` não saem pela API. */
interface AuditLogListRow {
  id: string;
  module: AuditModule;
  entity: string;
  entityId: string | null;
  action: AuditAction;
  description: string | null;
  changedFields: string[];
  userId: string | null;
  /** Nome atual do autor, do cadastro (também de usuário excluído); nunca cópia no registro. */
  userName: string | null;
  createdAt: Date;
}

/** Termo da busca já resolvido: o padrão do `ILIKE` e o que casa fora de `audit_logs` (catálogo e autores). */
interface ContentSearch {
  pattern: string;
  entities: AuditEntity[];
  authorIds: string[];
}

/** Coluna de cada campo da allowlist: o `ORDER BY` só recebe estes fragmentos fixos, nunca o texto da query. */
function toSortColumn(field: AuditLogSortField): Prisma.Sql {
  switch (field) {
    case "createdAt":
      return Prisma.sql`log."createdAt"`;
    case "module":
      return Prisma.sql`log.module`;
    case "entity":
      return Prisma.sql`log.entity`;
    case "action":
      return Prisma.sql`log.action`;
    case "description":
      return Prisma.sql`log.description`;
  }
}

/**
 * Só os valores de um JSON de `before`/`after`, como texto, sem o nome das chaves nem os nulos:
 * `{"name": "Ana", "image": null}` vira `["Ana"]`. É a expressão dos índices `audit_logs_before_values_trgm_idx` e
 * `audit_logs_after_values_trgm_idx` (migration `*_audit_logs_search_values`): o Postgres só usa o índice quando a
 * consulta repete a expressão igual. Mudar aqui exige uma migration que recrie os dois.
 */
function toJsonValuesText(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`jsonb_path_query_array(${column}, '$.* ? (@ != null)')::text`;
}

/**
 * Entidades cujo nome técnico ou rótulo pt-BR contém o termo, sem diferenciar maiúsculas: `usuário` e `user` acham
 * `User`. Resolvido no código, contra o catálogo, para a busca virar igualdade no índice de `entity`.
 */
function findEntitiesMatching(term: string): AuditEntity[] {
  const needle = term.toLowerCase();

  return AUDIT_ENTITIES.filter((entity) =>
    [entity, AUDIT_ENTITY_LABELS.get(entity) ?? ""].some((name) => name.toLowerCase().includes(needle)),
  );
}

/**
 * Ids dos usuários da empresa cujo nome casa com o padrão, **inclusive excluídos**: o autor excluído continua com o
 * nome na trilha e continua sendo achado por ele. Consulta à parte, antes da lista, para os ids chegarem ao
 * planejador como valores: com eles, o Postgres estima o ramo do autor pelo que existe de fato e escolhe entre os
 * índices da busca e o de data sem errar (uma subconsulta no mesmo `WHERE` tem estimativa fixa, que o fazia percorrer
 * a empresa inteira pelo índice de data num termo raro).
 */
async function findAuthorIdsMatching(companyId: string, pattern: string): Promise<string[]> {
  const authors = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE "companyId" = ${companyId} AND name ILIKE ${pattern}`;

  return authors.map((author) => author.id);
}

/**
 * Um ramo por lugar onde o termo pode estar, cada um atendido por índice: `entity` e autor por igualdade (resolvidos
 * antes), descrição, id do registro e valores de `before`/`after` por trigrama (`pg_trgm`). Os de igualdade vêm
 * primeiro porque, quando o Postgres varre as linhas (termo curto ou muito comum), o `OR` para no primeiro que casa.
 */
function toContentSearchSql({ pattern, entities, authorIds }: ContentSearch): Prisma.Sql {
  const branches: Prisma.Sql[] = [];

  if (entities.length > 0) {
    branches.push(Prisma.sql`log.entity = ANY(${entities}::text[])`);
  }

  if (authorIds.length > 0) {
    branches.push(Prisma.sql`log."userId" = ANY(${authorIds}::text[])`);
  }

  branches.push(
    Prisma.sql`log.description ILIKE ${pattern}`,
    Prisma.sql`log."entityId" ILIKE ${pattern}`,
    Prisma.sql`${toJsonValuesText(Prisma.sql`log.before`)} ILIKE ${pattern}`,
    Prisma.sql`${toJsonValuesText(Prisma.sql`log.after`)} ILIKE ${pattern}`,
  );

  return Prisma.sql`(${Prisma.join(branches, " OR ")})`;
}

/**
 * Filtros da lista, sempre dentro da empresa. Listas vão como um parâmetro só (`= ANY(...::text[])`); o período é
 * inclusivo nas duas pontas.
 */
function toWhereSql(companyId: string, query: ListAuditLogsQuery, search: ContentSearch | undefined): Prisma.Sql {
  const conditions = [Prisma.sql`log."companyId" = ${companyId}`];

  if (query.module) {
    conditions.push(Prisma.sql`log.module::text = ANY(${query.module}::text[])`);
  }

  if (query.entity) {
    conditions.push(Prisma.sql`log.entity = ANY(${query.entity}::text[])`);
  }

  if (query.action) {
    conditions.push(Prisma.sql`log.action::text = ANY(${query.action}::text[])`);
  }

  if (query.userId) {
    conditions.push(Prisma.sql`log."userId" = ANY(${query.userId}::text[])`);
  }

  if (query.entityId) {
    conditions.push(Prisma.sql`log."entityId" = ${query.entityId}`);
  }

  if (query.createdFrom) {
    conditions.push(Prisma.sql`log."createdAt" >= ${query.createdFrom}`);
  }

  if (query.createdTo) {
    conditions.push(Prisma.sql`log."createdAt" <= ${query.createdTo}`);
  }

  if (search) {
    conditions.push(toContentSearchSql(search));
  }

  return Prisma.join(conditions, " AND ");
}

/**
 * Busca por conteúdo: o termo, como texto literal, na descrição, no id do registro, nos valores de `before`/`after`
 * (não no nome das chaves), na entidade (nome técnico ou rótulo) e no nome do autor.
 *
 * Termo sem três letras ou dígitos seguidos (`ab`, `50%`) não forma trigrama: os índices não ajudam e o Postgres lê
 * as linhas da empresa. O resultado é o mesmo; só o custo cresce com o volume (ver "Trilha de auditoria" no CLAUDE.md).
 */
async function resolveContentSearch(companyId: string, term: string): Promise<ContentSearch> {
  const pattern = toContainsLikePattern(term);

  return { pattern, entities: findEntitiesMatching(term), authorIds: await findAuthorIdsMatching(companyId, pattern) };
}

/**
 * Trilha da empresa, paginada, com filtros, período inclusivo, busca por conteúdo e ordenação por allowlist. SQL
 * tagueado porque o Prisma não filtra pelos valores de uma coluna JSON; todo valor vai como parâmetro.
 */
export async function listAuditLogsService({ companyId, query }: ListAuditLogsInput) {
  const search = query.search ? await resolveContentSearch(companyId, query.search) : undefined;
  const where = toWhereSql(companyId, query, search);
  const direction = query.order === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const { skip, take } = toSkipTake(query);

  // O id (uuid v7, crescente no tempo) desempata no mesmo sentido: a paginação fica estável entre valores iguais.
  const [logs, [total]] = await prisma.$transaction([
    prisma.$queryRaw<AuditLogListRow[]>`
      SELECT log.id, log.module, log.entity, log."entityId", log.action, log.description, log."changedFields",
             log."userId", author.name AS "userName", log."createdAt"
      FROM audit_logs AS log
      LEFT JOIN users AS author ON author.id = log."userId"
      WHERE ${where}
      ORDER BY ${toSortColumn(query.orderBy)} ${direction}, log.id ${direction}
      LIMIT ${take} OFFSET ${skip}`,
    prisma.$queryRaw<[{ count: number }]>`
      SELECT count(*)::int AS count
      FROM audit_logs AS log
      WHERE ${where}`,
  ]);

  return { logs, count: total.count };
}

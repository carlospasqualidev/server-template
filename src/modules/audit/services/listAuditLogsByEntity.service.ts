import { type Prisma } from "@/generated/prisma/client";
import { toSkipTake } from "@/lib/http/pagination";
import { prisma } from "@/lib/prisma";
import { type AuditEntity } from "@/modules/audit/audit.catalog";
import { auditLogTimelineSelect, toAuditLogTimelineItem } from "@/modules/audit/audit.select";
import { type ListAuditLogsByEntityQuery } from "@/modules/audit/schemas/listAuditLogsByEntity.schema";

interface ListAuditLogsByEntityInput {
  companyId: string;
  entity: AuditEntity;
  entityId: string;
  query: ListAuditLogsByEntityQuery;
}

/**
 * Linha do tempo de um registro: os eventos da empresa com a entidade e o id, mais recente primeiro, com o de→para de
 * cada um. O filtro é o índice `[companyId, entity, entityId]`. Não confere se o registro existe: o histórico de um
 * usuário excluído continua legível, e o de outra empresa (ou inexistente) volta vazio.
 */
export async function listAuditLogsByEntityService({ companyId, entity, entityId, query }: ListAuditLogsByEntityInput) {
  const where = { companyId, entity, entityId } satisfies Prisma.AuditLogWhereInput;

  // O id (uuid v7, crescente no tempo) desempata no mesmo sentido: a paginação fica estável entre datas iguais.
  const [logs, count] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      select: auditLogTimelineSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...toSkipTake(query),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs: logs.map(toAuditLogTimelineItem), count };
}

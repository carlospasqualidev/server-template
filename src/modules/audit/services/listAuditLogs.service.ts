import { type Prisma } from "@/generated/prisma/client";
import { toSkipTake } from "@/lib/http/pagination";
import { toDateTimeRangeFilter } from "@/lib/http/query";
import { prisma } from "@/lib/prisma";
import { auditLogListSelect, toAuditLogListItem } from "@/modules/audit/audit.select";
import { type ListAuditLogsQuery } from "@/modules/audit/schemas/listAuditLogs.schema";

interface ListAuditLogsInput {
  companyId: string;
  query: ListAuditLogsQuery;
}

/** Trilha da empresa, paginada, com filtros, período inclusivo, busca e ordenação por allowlist. */
export async function listAuditLogsService({ companyId, query }: ListAuditLogsInput) {
  const createdAt = toDateTimeRangeFilter(query.createdFrom, query.createdTo);
  const where: Prisma.AuditLogWhereInput = {
    companyId,
    ...(query.module && { module: { in: query.module } }),
    ...(query.entity && { entity: { in: query.entity } }),
    ...(query.action && { action: { in: query.action } }),
    ...(query.userId && { userId: { in: query.userId } }),
    ...(query.entityId && { entityId: query.entityId }),
    ...(createdAt && { createdAt }),
    ...(query.search && {
      OR: [
        { description: { contains: query.search, mode: "insensitive" } },
        { entity: { contains: query.search, mode: "insensitive" } },
        { entityId: { contains: query.search, mode: "insensitive" } },
        { user: { name: { contains: query.search, mode: "insensitive" } } },
      ],
    }),
  };

  const [logs, count] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      select: auditLogListSelect,
      // O id (uuid v7, crescente no tempo) desempata: a paginação fica estável entre registros com o mesmo valor.
      orderBy: [{ [query.orderBy]: query.order }, { id: query.order }],
      ...toSkipTake(query),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs: logs.map(toAuditLogListItem), count };
}

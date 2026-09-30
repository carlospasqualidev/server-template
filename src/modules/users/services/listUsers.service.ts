import { type Prisma } from "@/generated/prisma/client";
import { toSkipTake } from "@/lib/http/pagination";
import { notDeleted, prisma } from "@/lib/prisma";
import { type ListUsersQuery } from "@/modules/users/schemas/listUsers.schema";
import { currentRolesWhere, toUserWithRoles, userCrudSelect } from "@/modules/users/users.select";

interface ListUsersInput {
  companyId: string;
  query: ListUsersQuery;
}

/**
 * Ordenação da lista. Em `lastLoginAt`, quem nunca acessou (null) fica no fim nos dois sentidos. O id (uuid v7) desempata:
 * a paginação fica estável entre usuários com o mesmo valor (vários que nunca acessaram, nomes iguais, o mesmo status).
 */
function toUsersOrderBy({ orderBy, order }: ListUsersQuery): Prisma.UserOrderByWithRelationInput[] {
  const primary: Prisma.UserOrderByWithRelationInput =
    orderBy === "lastLoginAt" ? { lastLoginAt: { sort: order, nulls: "last" } } : { [orderBy]: order };

  return [primary, { id: order }];
}

/**
 * Listagem paginada de referência: escopo por tenant, exclusão lógica, busca, filtros e ordenação por allowlist. O
 * período de cadastro não tem índice próprio: filtra a lista já recortada pelo índice de `companyId`.
 */
export async function listUsersService({ companyId, query }: ListUsersInput) {
  const where: Prisma.UserWhereInput = {
    companyId,
    ...notDeleted,
    ...(query.isActive !== undefined && { isActive: query.isActive }),
    // Só cargo que vale conta: id de cargo de outra empresa (ou excluído) no filtro não encontra ninguém.
    ...(query.roleId && { userRoles: { some: { roleId: { in: query.roleId }, ...currentRolesWhere(companyId) } } }),
    // Período de cadastro, inclusivo nas duas pontas.
    ...((query.createdFrom || query.createdTo) && { createdAt: { gte: query.createdFrom, lte: query.createdTo } }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    }),
  };

  const [users, count] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userCrudSelect(companyId),
      orderBy: toUsersOrderBy(query),
      ...toSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);

  return { users: users.map(toUserWithRoles), count };
}

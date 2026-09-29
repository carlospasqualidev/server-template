import { type Prisma } from "@/generated/prisma/client";
import { toSkipTake } from "@/lib/http/pagination";
import { notDeleted, prisma } from "@/lib/prisma";
import { type ListUsersQuery } from "@/modules/users/schemas/listUsers.schema";
import { userSelect } from "@/modules/users/users.select";

interface ListUsersInput {
  companyId: string;
  query: ListUsersQuery;
}

/** Listagem paginada de referência: escopo por tenant, exclusão lógica, busca, filtro e ordenação por allowlist. */
export async function listUsersService({ companyId, query }: ListUsersInput) {
  const where: Prisma.UserWhereInput = {
    companyId,
    ...notDeleted,
    ...(query.isActive !== undefined && { isActive: query.isActive }),
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
      select: userSelect,
      orderBy: { [query.orderBy]: query.order },
      ...toSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);

  return { users, count };
}

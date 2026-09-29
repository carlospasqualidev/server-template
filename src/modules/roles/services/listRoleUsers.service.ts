import { type Prisma } from "@/generated/prisma/client";
import { assertExists } from "@/lib/errors";
import { toSkipTake } from "@/lib/http/pagination";
import { notDeleted, prisma } from "@/lib/prisma";
import { roleUserSelect } from "@/modules/roles/roles.select";
import { type ListRoleUsersQuery } from "@/modules/roles/schemas/listRoleUsers.schema";

interface ListRoleUsersInput {
  companyId: string;
  roleId: string;
  query: ListRoleUsersQuery;
}

/** Usuários da empresa com o cargo, paginados. Bloqueados entram (continuam com o cargo); excluídos, não. */
export async function listRoleUsersService({ companyId, roleId, query }: ListRoleUsersInput) {
  const role = await prisma.role.findFirst({ where: { id: roleId, companyId, ...notDeleted }, select: { id: true } });

  assertExists(role, "Cargo");

  const where: Prisma.UserWhereInput = {
    companyId,
    ...notDeleted,
    userRoles: { some: { roleId } },
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
      select: roleUserSelect,
      orderBy: { [query.orderBy]: query.order },
      ...toSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);

  return { users, count };
}

import { type Prisma } from "@/generated/prisma/client";
import { toSkipTake } from "@/lib/http/pagination";
import { notDeleted, prisma } from "@/lib/prisma";
import { roleListSelect, toRoleListItem } from "@/modules/roles/roles.select";
import { type ListRolesQuery } from "@/modules/roles/schemas/listRoles.schema";

interface ListRolesInput {
  companyId: string;
  query: ListRolesQuery;
}

export async function listRolesService({ companyId, query }: ListRolesInput) {
  const where: Prisma.RoleWhereInput = {
    companyId,
    ...notDeleted,
    ...(query.search && { name: { contains: query.search, mode: "insensitive" } }),
  };

  const [roles, count] = await prisma.$transaction([
    prisma.role.findMany({
      where,
      select: roleListSelect(companyId),
      orderBy: { [query.orderBy]: query.order },
      ...toSkipTake(query),
    }),
    prisma.role.count({ where }),
  ]);

  return { roles: roles.map(toRoleListItem), count };
}

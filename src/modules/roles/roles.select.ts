import { type Prisma } from "@/generated/prisma/client";

/**
 * Vínculos que contam como usuários do cargo: usuário não excluído e da empresa do cargo. Bloqueado conta, porque
 * continua com o cargo. Usado na contagem, na listagem, na troca dos usuários do cargo e na exclusão.
 */
export function roleMembersWhere(companyId: string) {
  return { user: { companyId, deletedAt: null } } satisfies Prisma.UserRoleWhereInput;
}

const roleBaseSelect = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RoleSelect;

/** Colunas da listagem de cargos. Espelha `roleListItemSchema` depois de `toRoleListItem`. */
export function roleListSelect(companyId: string) {
  return {
    ...roleBaseSelect,
    _count: { select: { rolePermissions: true, userRoles: { where: roleMembersWhere(companyId) } } },
  } satisfies Prisma.RoleSelect;
}

/** Colunas do detalhe do cargo (e da resposta das mutations). Espelha `roleSchema` depois de `toRoleDetail`. */
export function roleDetailSelect(companyId: string) {
  return {
    ...roleBaseSelect,
    rolePermissions: {
      select: { permission: { select: { id: true, name: true } } },
      orderBy: { permission: { name: "asc" } },
    },
    _count: { select: { userRoles: { where: roleMembersWhere(companyId) } } },
  } satisfies Prisma.RoleSelect;
}

type RoleListRow = Prisma.RoleGetPayload<{ select: ReturnType<typeof roleListSelect> }>;
type RoleDetailRow = Prisma.RoleGetPayload<{ select: ReturnType<typeof roleDetailSelect> }>;

export function toRoleListItem({ _count, ...role }: RoleListRow) {
  return { ...role, permissionsCount: _count.rolePermissions, usersCount: _count.userRoles };
}

export function toRoleDetail({ _count, rolePermissions, ...role }: RoleDetailRow) {
  return {
    ...role,
    permissions: rolePermissions.map((rolePermission) => rolePermission.permission),
    usersCount: _count.userRoles,
  };
}

/** Colunas dos usuários de um cargo (`GET /roles/:roleId/users`). Espelha `roleUserSchema`. */
export const roleUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  isActive: true,
} satisfies Prisma.UserSelect;

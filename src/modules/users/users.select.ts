import { type Prisma } from "@/generated/prisma/client";

/** Colunas devolvidas pelo CRUD. Espelha `userSchema`; `password` nunca sai daqui. */
export const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/**
 * `userSelect` mais os cargos do usuário (não excluídos, da empresa dele), em ordem alfabética. Leia o resultado com
 * `toUserWithRoles`; espelha `userWithRolesSchema`.
 */
export function userWithRolesSelect(companyId: string) {
  return {
    ...userSelect,
    userRoles: {
      where: { role: { companyId, deletedAt: null } },
      select: { role: { select: { id: true, name: true, isSystem: true } } },
      orderBy: { role: { name: "asc" } },
    },
  } satisfies Prisma.UserSelect;
}

type UserWithRolesRow = Prisma.UserGetPayload<{ select: ReturnType<typeof userWithRolesSelect> }>;

export function toUserWithRoles({ userRoles, ...user }: UserWithRolesRow) {
  return { ...user, roles: userRoles.map((userRole) => userRole.role) };
}

/** Colunas devolvidas na sessão (login, register, /me). `userSummarySchema` soma a elas as `permissions` efetivas. */
export const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} satisfies Prisma.UserSelect;

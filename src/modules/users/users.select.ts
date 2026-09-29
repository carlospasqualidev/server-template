import { type Prisma } from "@/generated/prisma/client";

/**
 * Linha cadastral do usuário: o que o CRUD edita, mais id e datas; `password` nunca sai daqui. É também o estado do
 * usuário na trilha de auditoria (criação, edição, exclusão). A resposta do CRUD soma a ela o último acesso e os cargos
 * (`userCrudSelect`).
 */
export const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  phone: true,
  isActive: true,
  idleTimeoutMinutes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/** Cargos que valem para o usuário: não excluídos e da empresa dele. Vínculo com cargo de outra empresa não conta. */
export function currentRolesWhere(companyId: string) {
  return { role: { companyId, deletedAt: null } } satisfies Prisma.UserRoleWhereInput;
}

/**
 * O usuário como o CRUD o devolve (lista, detalhe, criação, edição): a linha cadastral, o último acesso e os cargos
 * que valem, em ordem alfabética. Espelha `userSchema`; leia o resultado com `toUserWithRoles`.
 */
export function userCrudSelect(companyId: string) {
  return {
    ...userSelect,
    lastLoginAt: true,
    userRoles: {
      where: currentRolesWhere(companyId),
      select: { role: { select: { id: true, name: true } } },
      orderBy: { role: { name: "asc" } },
    },
  } satisfies Prisma.UserSelect;
}

export type UserCrudRow = Prisma.UserGetPayload<{ select: ReturnType<typeof userCrudSelect> }>;

/** `userCrudSelect` com `isSystem` em cada cargo, para a resposta de `PUT /users/:userId/roles` (`userWithRolesSchema`). */
export function userWithRolesSelect(companyId: string) {
  return {
    ...userSelect,
    lastLoginAt: true,
    userRoles: {
      where: currentRolesWhere(companyId),
      select: { role: { select: { id: true, name: true, isSystem: true } } },
      orderBy: { role: { name: "asc" } },
    },
  } satisfies Prisma.UserSelect;
}

/** Troca a tabela de ligação (`userRoles`) pela lista de cargos (`roles`) que as respostas expõem. */
export function toUserWithRoles<TRow extends object, TRole>({
  userRoles,
  ...user
}: TRow & { userRoles: readonly { role: TRole }[] }) {
  return { ...user, roles: userRoles.map((userRole) => userRole.role) };
}

/**
 * Colunas devolvidas na sessão (login, register, /me). `userSummarySchema` soma a elas as `permissions` efetivas e o
 * `idleTimeoutMinutes` já resolvido.
 */
export const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} satisfies Prisma.UserSelect;

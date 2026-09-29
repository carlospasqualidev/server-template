import { type Prisma } from "@/generated/prisma/client";

/**
 * Como a consulta conhece a empresa do usuário: pelo `companyId`, quando já o tem, ou pelo `userId` (a empresa que
 * contém este usuário), quando parte só do id, como a leitura da sessão.
 */
export type UserCompanyScope = { companyId: string } | { userId: string };

function roleOfUserCompany(scope: UserCompanyScope): Prisma.RoleWhereInput {
  return "companyId" in scope ? { companyId: scope.companyId } : { company: { users: { some: { id: scope.userId } } } };
}

/**
 * Cargos que valem para o usuário e as permissões de cada um: cargo não excluído **e da empresa do usuário**.
 * `UserRole` não guarda a empresa e o banco não impede o vínculo com cargo de outra empresa (não há FK composta):
 * esta consulta garante que um vínculo assim nunca concede permissão.
 *
 * Componha no `select` de `user` (`userRoles: effectivePermissionsSelect({ userId })`) para ler o usuário e as
 * permissões efetivas numa consulta só, e leia o resultado com `toPermissionNames`.
 */
export function effectivePermissionsSelect(scope: UserCompanyScope) {
  return {
    where: { role: { deletedAt: null, ...roleOfUserCompany(scope) } },
    select: { role: { select: { rolePermissions: { select: { permission: { select: { name: true } } } } } } },
  } satisfies Prisma.UserRoleFindManyArgs;
}

interface UserRoleWithPermissions {
  role: { rolePermissions: { permission: { name: string } }[] };
}

/** Achata os cargos em `string[]`: união sem repetição, em ordem alfabética (o formato de `user.permissions`). */
export function toPermissionNames(userRoles: readonly UserRoleWithPermissions[]): string[] {
  const names = new Set<string>();

  for (const userRole of userRoles) {
    for (const rolePermission of userRole.role.rolePermissions) {
      names.add(rolePermission.permission.name);
    }
  }

  return [...names].toSorted();
}

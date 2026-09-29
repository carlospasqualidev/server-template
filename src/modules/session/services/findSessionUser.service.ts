import { notDeleted, prisma } from "@/lib/prisma";
import { effectivePermissionsSelect, toPermissionNames } from "@/modules/permissions/permissions.select";

/**
 * Usado pelo hook `requireSession` a cada requisição autenticada: estado da conta e permissões efetivas numa leitura
 * só, para bloqueio, exclusão e mudança de cargo valerem na próxima requisição, sem novo login.
 */
export async function findSessionUserService(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, ...notDeleted },
    select: {
      id: true,
      name: true,
      email: true,
      companyId: true,
      isActive: true,
      userRoles: effectivePermissionsSelect({ userId }),
    },
  });

  if (!user) {
    return null;
  }

  const { userRoles, ...account } = user;

  return { ...account, permissions: toPermissionNames(userRoles) };
}

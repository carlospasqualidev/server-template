import { prisma } from "@/lib/prisma";
import { effectivePermissionsSelect, toPermissionNames } from "@/modules/permissions/permissions.select";

interface FindEffectivePermissionsInput {
  userId: string;
  companyId: string;
}

/**
 * Permissões efetivas do usuário (união dos cargos não excluídos da empresa dele), achatadas e ordenadas. Para quem já
 * lê o usuário, prefira compor `effectivePermissionsSelect` na mesma consulta.
 */
export async function findEffectivePermissionsService({
  userId,
  companyId,
}: FindEffectivePermissionsInput): Promise<string[]> {
  const { where, select } = effectivePermissionsSelect({ companyId });
  const userRoles = await prisma.userRole.findMany({ where: { userId, ...where }, select });

  return toPermissionNames(userRoles);
}

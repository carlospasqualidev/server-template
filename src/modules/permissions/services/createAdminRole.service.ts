import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLE, PERMISSION_NAMES } from "@/modules/permissions/permission.catalog";

interface CreateAdminRoleInput {
  companyId: string;
}

/**
 * Cria o cargo de sistema `Administrador` da empresa com o catálogo inteiro. Chamado na criação da empresa
 * (register, seed), dentro da mesma transação: passe o `tx` em `client`.
 */
export async function createAdminRoleService(
  { companyId }: CreateAdminRoleInput,
  client: Prisma.TransactionClient = prisma,
) {
  const permissions = await client.permission.findMany({
    where: { name: { in: [...PERMISSION_NAMES] } },
    select: { id: true },
  });

  return client.role.create({
    data: {
      companyId,
      name: ADMIN_ROLE.name,
      description: ADMIN_ROLE.description,
      isSystem: true,
      rolePermissions: { createMany: { data: permissions.map((permission) => ({ permissionId: permission.id })) } },
    },
    select: { id: true },
  });
}

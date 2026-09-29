import { type Prisma } from "@/generated/prisma/client";
import { notDeleted, prisma } from "@/lib/prisma";
import { ADMIN_ROLE } from "@/modules/permissions/permission.catalog";

interface IsLastActiveAdminInput {
  companyId: string;
  userId: string;
}

/**
 * `true` quando `userId` é o único usuário ativo (não bloqueado, não excluído) com o cargo `Administrador` da
 * empresa. Quem bloqueia, exclui ou tira o cargo de um usuário consulta isto antes e recusa com 400: a empresa nunca
 * fica sem um administrador ativo. Usuário bloqueado ou sem o cargo nunca é o último.
 *
 * Chame dentro da transação da escrita, depois de `lockCompanyAdminsService({ companyId }, tx)` e com o mesmo `tx`:
 * sem a trava, duas requisições simultâneas passam juntas pela checagem.
 */
export async function isLastActiveAdminService(
  { companyId, userId }: IsLastActiveAdminInput,
  client: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const activeAdmins = await client.user.findMany({
    where: {
      companyId,
      isActive: true,
      ...notDeleted,
      userRoles: { some: { role: { companyId, name: ADMIN_ROLE.name, isSystem: true, ...notDeleted } } },
    },
    select: { id: true },
    take: 2,
  });

  return activeAdmins.length === 1 && activeAdmins.some((admin) => admin.id === userId);
}

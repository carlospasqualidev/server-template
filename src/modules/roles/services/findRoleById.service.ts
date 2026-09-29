import { type Prisma } from "@/generated/prisma/client";
import { assertExists } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { roleDetailSelect, toRoleDetail } from "@/modules/roles/roles.select";

interface FindRoleByIdInput {
  companyId: string;
  roleId: string;
}

/**
 * Cargo da empresa, com as permissões. Cargo de outra empresa ou excluído responde 404. Aceita `tx` em `client`, para
 * devolver o cargo já gravado de dentro da transação da escrita.
 */
export async function findRoleByIdService(
  { companyId, roleId }: FindRoleByIdInput,
  client: Prisma.TransactionClient = prisma,
) {
  const role = await client.role.findFirst({
    where: { id: roleId, companyId, ...notDeleted },
    select: roleDetailSelect(companyId),
  });

  assertExists(role, "Cargo");

  return toRoleDetail(role);
}

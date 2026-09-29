import { ConflictError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

interface AssertRoleNameAvailableInput {
  companyId: string;
  name: string;
  /** Cargo em edição: o próprio nome dele não conta como repetido. */
  roleId?: string;
}

/**
 * O nome do cargo é único na empresa, inclusive contra cargos excluídos (o índice `roles_companyId_name_key` também
 * os inclui). Responde 409 com mensagem própria para cada caso: o cargo excluído não aparece na lista.
 */
export async function assertRoleNameAvailableService({
  companyId,
  name,
  roleId,
}: AssertRoleNameAvailableInput): Promise<void> {
  const owner = await prisma.role.findUnique({
    where: { companyId_name: { companyId, name } },
    select: { id: true, deletedAt: true },
  });

  if (!owner || owner.id === roleId) {
    return;
  }

  throw new ConflictError(
    owner.deletedAt
      ? "Este nome pertence a um cargo excluído. Escolha outro nome."
      : "Já existe um cargo com este nome.",
  );
}

import { assertExists, BadRequestError, ConflictError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { AUDIT_DESCRIPTIONS } from "@/modules/audit/audit.descriptions";
import { recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { assertCanGrantPermissionsService } from "@/modules/permissions/services/assertCanGrantPermissions.service";
import { toRoleAuditSnapshot } from "@/modules/roles/roles.audit";
import { roleDetailSelect, toRoleDetail } from "@/modules/roles/roles.select";

/** Quantos nomes de cópia tentar: `X (cópia)`, `X (cópia 2)` ... `X (cópia 50)`. */
const COPY_NAME_ATTEMPTS = 50;

function copyNameCandidates(name: string): string[] {
  return Array.from({ length: COPY_NAME_ATTEMPTS }, (_, index) =>
    index === 0 ? `${name} (cópia)` : `${name} (cópia ${index + 1})`,
  );
}

interface CopyRoleInput {
  companyId: string;
  /** Usuário da sessão: só copia cargo cujas permissões possui. */
  actorId: string;
  roleId: string;
}

/**
 * Novo cargo com a descrição e as permissões do original, sem os usuários, com o primeiro nome de cópia livre na
 * empresa (cargos excluídos também ocupam o nome). O cargo de sistema não é copiado.
 */
export async function copyRoleService({ companyId, actorId, roleId }: CopyRoleInput) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.role.findFirst({
      where: { id: roleId, companyId, ...notDeleted },
      select: { name: true, description: true, isSystem: true, rolePermissions: { select: { permissionId: true } } },
    });

    assertExists(source, "Cargo");

    if (source.isSystem) {
      throw new BadRequestError(`O cargo "${source.name}" é do sistema e não pode ser copiado.`);
    }

    const permissionIds = source.rolePermissions.map(({ permissionId }) => permissionId);

    // A cópia é um cargo novo: todas as permissões do original contam como concedidas.
    await assertCanGrantPermissionsService({ companyId, actorId, permissionIds }, tx);

    const candidates = copyNameCandidates(source.name);
    const taken = await tx.role.findMany({
      where: { companyId, name: { in: candidates } },
      select: { name: true },
      take: COPY_NAME_ATTEMPTS,
    });
    const takenNames = new Set(taken.map((current) => current.name));
    const name = candidates.find((candidate) => !takenNames.has(candidate));

    if (name === undefined) {
      throw new ConflictError("Não foi possível gerar um nome para a cópia. Renomeie as cópias existentes.");
    }

    const role = toRoleDetail(
      await tx.role.create({
        data: {
          companyId,
          name,
          description: source.description,
          rolePermissions: { createMany: { data: permissionIds.map((permissionId) => ({ permissionId })) } },
        },
        select: roleDetailSelect(companyId),
      }),
    );

    await recordAuditService(
      {
        companyId,
        module: "SECURITY",
        entity: "Role",
        entityId: role.id,
        action: "create",
        description: AUDIT_DESCRIPTIONS.Role.copied(source.name, role.name),
        after: toRoleAuditSnapshot(role),
      },
      tx,
    );

    return role;
  });
}

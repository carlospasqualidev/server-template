import { type Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { assertExists, BadRequestError, ConflictError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { AUDIT_DESCRIPTIONS } from "@/modules/audit/audit.descriptions";
import { type AuditEntry, recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { isLastActiveAdminService } from "@/modules/permissions/services/isLastActiveAdmin.service";
import { lockCompanyAdminsService } from "@/modules/permissions/services/lockCompanyAdmins.service";
import { type UpdateUserBody } from "@/modules/users/schemas/updateUser.schema";
import { findUserByIdService } from "@/modules/users/services/findUserById.service";
import { toUserAuditState } from "@/modules/users/users.audit";
import { toUserWithRoles, userCrudSelect, userSelect } from "@/modules/users/users.select";

interface UpdateUserInput {
  companyId: string;
  userId: string;
  data: UpdateUserBody;
  /**
   * Troca da própria senha: o hash que foi conferido com a senha atual, fora da transação (bcrypt não segura a trava).
   * Se, com a linha já travada, o hash gravado for outro, a senha mudou no meio (outra troca, um administrador) e a
   * edição responde 409 em vez de sobrescrevê-la.
   */
  expectedPasswordHash?: string;
}

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

interface UserChange {
  companyId: string;
  before: UserRow;
  after: UserRow;
  passwordChanged: boolean;
}

/**
 * Registros da edição: `update` (módulo `USERS`) com os campos cadastrais e, quando o status muda, um `statusChange`
 * (módulo `SECURITY`) só com `isActive`. A senha trocada aparece só como campo alterado, sem valor.
 */
function toUserChangeAuditEntries({ companyId, before, after, passwordChanged }: UserChange): AuditEntry<"User">[] {
  const { isActive: wasActive, ...fieldsBefore } = before;
  const { isActive, ...fieldsAfter } = after;
  const entries: AuditEntry<"User">[] = [
    {
      companyId,
      module: "USERS",
      entity: "User",
      entityId: after.id,
      action: "update",
      description: AUDIT_DESCRIPTIONS.User.updated(after.name),
      before: fieldsBefore,
      after: fieldsAfter,
      hiddenChangedFields: passwordChanged ? ["password"] : [],
    },
  ];

  if (wasActive !== isActive) {
    entries.push({
      companyId,
      module: "SECURITY",
      entity: "User",
      entityId: after.id,
      action: "statusChange",
      description: isActive
        ? AUDIT_DESCRIPTIONS.User.unblocked(after.name)
        : AUDIT_DESCRIPTIONS.User.blocked(after.name),
      before: { isActive: wasActive },
      after: { isActive },
    });
  }

  return entries;
}

export async function updateUserService({ companyId, userId, data, expectedPasswordHash }: UpdateUserInput) {
  await findUserByIdService({ companyId, userId });

  // Hash calculado antes da transação: a trava dos administradores não espera o bcrypt.
  const updateData: Prisma.UserUpdateInput = {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.isActive !== undefined && { isActive: data.isActive }),
    ...(data.idleTimeoutMinutes !== undefined && { idleTimeoutMinutes: data.idleTimeoutMinutes }),
    ...(data.password !== undefined && { password: await hashPassword(data.password) }),
  };

  return prisma.$transaction(async (tx) => {
    if (data.isActive === false) {
      await lockCompanyAdminsService({ companyId }, tx);

      if (await isLastActiveAdminService({ companyId, userId }, tx)) {
        throw new BadRequestError("Não é possível bloquear o último administrador ativo da empresa.");
      }
    }

    // Trava a linha antes de ler o estado anterior: duas edições simultâneas do mesmo usuário não registram o mesmo
    // "antes". Mesma força da trava do UPDATE; o usuário excluído nesse meio tempo responde 404.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
    const before = await tx.user.findFirst({ where: { id: userId, companyId, ...notDeleted }, select: userSelect });

    assertExists(before, "Usuário");

    if (expectedPasswordHash !== undefined) {
      const { password: currentPasswordHash } = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { password: true },
      });

      if (currentPasswordHash !== expectedPasswordHash) {
        throw new ConflictError("A senha foi alterada enquanto você fazia a troca. Tente novamente com a senha atual.");
      }
    }

    const user = await tx.user.update({ where: { id: userId }, data: updateData, select: userCrudSelect(companyId) });

    await recordAuditService(
      toUserChangeAuditEntries({
        companyId,
        before,
        after: toUserAuditState(user),
        passwordChanged: data.password !== undefined,
      }),
      tx,
    );

    return toUserWithRoles(user);
  });
}

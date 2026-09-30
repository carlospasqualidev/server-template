import { hashPassword } from "@/lib/auth/password";
import { ConflictError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { AUDIT_DESCRIPTIONS } from "@/modules/audit/audit.descriptions";
import { recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { type CreateUserBody } from "@/modules/users/schemas/createUser.schema";
import { toUserAuditState } from "@/modules/users/users.audit";
import { toUserWithRoles, userCrudSelect } from "@/modules/users/users.select";

interface CreateUserInput {
  companyId: string;
  data: CreateUserBody;
}

export async function createUserService({ companyId, data }: CreateUserInput) {
  const emailInUse = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });

  if (emailInUse) {
    throw new ConflictError("E-mail já cadastrado.");
  }

  const passwordHash = await hashPassword(data.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        companyId,
        name: data.name,
        email: data.email,
        password: passwordHash,
        phone: data.phone ?? null,
        image: data.image ?? null,
        idleTimeoutMinutes: data.idleTimeoutMinutes ?? null,
      },
      select: userCrudSelect(companyId),
    });

    await recordAuditService(
      {
        companyId,
        module: "USERS",
        entity: "User",
        entityId: user.id,
        action: "create",
        description: AUDIT_DESCRIPTIONS.User.created(user.name),
        after: toUserAuditState(user),
      },
      tx,
    );

    return toUserWithRoles(user);
  });
}

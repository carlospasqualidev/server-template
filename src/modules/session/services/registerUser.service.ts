import { hashPassword } from "@/lib/auth/password";
import { ConflictError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { effectivePermissionsSelect, toPermissionNames } from "@/modules/permissions/permissions.select";
import { createAdminRoleService } from "@/modules/permissions/services/createAdminRole.service";
import { PERMISSION_CATALOG_LOCK_NAME } from "@/modules/permissions/services/syncPermissionCatalog.service";
import { type RegisterBody } from "@/modules/session/schemas/register.schema";
import { resolveIdleTimeoutMinutesService } from "@/modules/systemConfigs/services/resolveIdleTimeoutMinutes.service";

/**
 * Cria a empresa, o cargo `Administrador` dela e o usuário vinculado ao cargo, numa transação, com o registro da
 * criação do usuário na trilha de auditoria.
 */
export async function registerUserService({ name, email, password }: RegisterBody) {
  const emailInUse = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (emailInUse) {
    throw new ConflictError("E-mail já cadastrado.");
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    // Trava compartilhada do catálogo: uma sincronização em andamento termina antes de o `Administrador` ler as
    // permissões. Sem ela, o cargo nasceria sem a permissão que a sincronização acabou de criar (ela só a concede
    // aos cargos que já enxerga) ou falharia por FK ao vincular a que ela está apagando. Registers não se esperam.
    // `$executeRaw` porque a função devolve `void`.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${PERMISSION_CATALOG_LOCK_NAME}))`;

    const company = await tx.company.create({ data: { name: `Empresa de ${name}` }, select: { id: true } });
    const adminRole = await createAdminRoleService({ companyId: company.id }, tx);

    const created = await tx.user.create({
      data: {
        companyId: company.id,
        name,
        email,
        password: passwordHash,
        userRoles: { create: { roleId: adminRole.id } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        companyId: true,
        idleTimeoutMinutes: true,
        userRoles: effectivePermissionsSelect({ companyId: company.id }),
      },
    });

    // Autor = o próprio usuário: a rota é pública, a sessão só nasce com a resposta.
    await recordAuditService(
      {
        companyId: company.id,
        module: "USERS",
        entity: "User",
        entityId: created.id,
        action: "create",
        description: "Criou a própria conta",
        after: created,
        userId: created.id,
      },
      tx,
    );

    return created;
  });

  const { userRoles, companyId, idleTimeoutMinutes: userIdleTimeoutMinutes, ...summary } = user;

  return {
    ...summary,
    permissions: toPermissionNames(userRoles),
    idleTimeoutMinutes: await resolveIdleTimeoutMinutesService({ companyId, userIdleTimeoutMinutes }),
  };
}

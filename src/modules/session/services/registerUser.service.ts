import { hashPassword } from "@/lib/auth/password";
import { ConflictError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { effectivePermissionsSelect, toPermissionNames } from "@/modules/permissions/permissions.select";
import { createAdminRoleService } from "@/modules/permissions/services/createAdminRole.service";
import { PERMISSION_CATALOG_LOCK_NAME } from "@/modules/permissions/services/syncPermissionCatalog.service";
import { type RegisterBody } from "@/modules/session/schemas/register.schema";

/** Cria a empresa, o cargo `Administrador` dela e o usuário vinculado ao cargo, numa transação. */
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

    return tx.user.create({
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
        userRoles: effectivePermissionsSelect({ companyId: company.id }),
      },
    });
  });

  const { userRoles, ...summary } = user;

  return { ...summary, permissions: toPermissionNames(userRoles) };
}

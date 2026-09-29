import { hashSync } from "bcrypt";

import { prisma } from "@/lib/prisma";
import { ADMIN_ROLE } from "@/modules/permissions/permission.catalog";
import { createAdminRoleService } from "@/modules/permissions/services/createAdminRole.service";
import { syncPermissionCatalogService } from "@/modules/permissions/services/syncPermissionCatalog.service";

/**
 * Dados mínimos para desenvolvimento: o catálogo de permissões, uma empresa com o cargo `Administrador`, um admin
 * ativo com esse cargo e um usuário bloqueado sem cargo. Idempotente. Senha de todos: `123123123`.
 */
async function main() {
  const { created, updated, removed } = await syncPermissionCatalogService();
  console.info(`Permissões: ${created.length} criadas, ${updated.length} atualizadas, ${removed} removidas.`);

  const password = hashSync("123123123", 12);

  const company = await prisma.company.upsert({
    where: { id: "00000000-0000-7000-8000-000000000001" },
    update: {},
    create: { id: "00000000-0000-7000-8000-000000000001", name: "Empresa Padrão" },
  });

  const adminRole =
    (await prisma.role.findUnique({
      where: { companyId_name: { companyId: company.id, name: ADMIN_ROLE.name } },
      select: { id: true },
    })) ?? (await createAdminRoleService({ companyId: company.id }));

  const admin = await prisma.user.upsert({
    where: { email: "admin@admin.com" },
    update: {},
    create: { name: "Admin", email: "admin@admin.com", password, companyId: company.id },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  await prisma.user.upsert({
    where: { email: "blocked@admin.com" },
    update: {},
    create: { name: "Usuário Bloqueado", email: "blocked@admin.com", password, companyId: company.id, isActive: false },
  });

  console.info("Seed concluído: admin@admin.com / 123123123 (Administrador)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

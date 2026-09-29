import { hashSync } from "bcrypt";

import { prisma } from "@/lib/prisma";

/**
 * Dados mínimos para desenvolvimento: uma empresa, um admin ativo e um usuário bloqueado.
 * Idempotente (upsert). Senha de todos: `123123123`.
 */
async function main() {
  const password = hashSync("123123123", 12);

  const company = await prisma.company.upsert({
    where: { id: "00000000-0000-7000-8000-000000000001" },
    update: {},
    create: { id: "00000000-0000-7000-8000-000000000001", name: "Empresa Padrão" },
  });

  await prisma.user.upsert({
    where: { email: "admin@admin.com" },
    update: {},
    create: { name: "Admin", email: "admin@admin.com", password, companyId: company.id },
  });

  await prisma.user.upsert({
    where: { email: "blocked@admin.com" },
    update: {},
    create: { name: "Usuário Bloqueado", email: "blocked@admin.com", password, companyId: company.id, isActive: false },
  });

  console.info("Seed concluído: admin@admin.com / 123123123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

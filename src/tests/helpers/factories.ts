import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

export const DEFAULT_PASSWORD = "123123123";

let sequence = 0;

function nextSequence(): number {
  sequence += 1;

  return sequence;
}

interface CompanyOverrides {
  name?: string;
}

export async function createCompany(overrides: CompanyOverrides = {}) {
  return prisma.company.create({
    data: { name: overrides.name ?? `Empresa ${nextSequence()}` },
  });
}

interface UserOverrides {
  companyId?: string;
  name?: string;
  email?: string;
  password?: string;
  phone?: string | null;
  image?: string | null;
  isActive?: boolean;
  deletedAt?: Date | null;
}

/** Usuário persistido com senha já hasheada. Cria uma empresa quando `companyId` não é informado. */
export async function createUser(overrides: UserOverrides = {}) {
  const companyId = overrides.companyId ?? (await createCompany()).id;
  const index = nextSequence();

  return prisma.user.create({
    data: {
      companyId,
      name: overrides.name ?? `Usuário ${index}`,
      email: overrides.email ?? `user${index}@example.com`,
      password: await hashPassword(overrides.password ?? DEFAULT_PASSWORD),
      phone: overrides.phone ?? null,
      image: overrides.image ?? null,
      isActive: overrides.isActive ?? true,
      deletedAt: overrides.deletedAt ?? null,
    },
  });
}

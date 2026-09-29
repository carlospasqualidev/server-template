import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLE, type PermissionName } from "@/modules/permissions/permission.catalog";
import { createAdminRoleService } from "@/modules/permissions/services/createAdminRole.service";

export const DEFAULT_PASSWORD = "123123123";

let sequence = 0;

function nextSequence(): number {
  sequence += 1;

  return sequence;
}

interface CompanyOverrides {
  name?: string;
}

/** Empresa com o cargo de sistema `Administrador`, como o register cria. */
export async function createCompany(overrides: CompanyOverrides = {}) {
  const company = await prisma.company.create({
    data: { name: overrides.name ?? `Empresa ${nextSequence()}` },
  });

  await createAdminRoleService({ companyId: company.id });

  return company;
}

/** Cargo `Administrador` da empresa (criado por `createCompany`). */
export async function findAdminRole(companyId: string) {
  return prisma.role.findUniqueOrThrow({ where: { companyId_name: { companyId, name: ADMIN_ROLE.name } } });
}

interface RoleOverrides {
  companyId?: string;
  name?: string;
  permissions?: readonly PermissionName[];
  deletedAt?: Date | null;
}

/** Cargo comum (não de sistema) com as permissões informadas. Cria uma empresa quando `companyId` não é informado. */
export async function createRole(overrides: RoleOverrides = {}) {
  const companyId = overrides.companyId ?? (await createCompany()).id;
  const permissions = await prisma.permission.findMany({
    where: { name: { in: [...(overrides.permissions ?? [])] } },
    select: { id: true },
  });

  return prisma.role.create({
    data: {
      companyId,
      name: overrides.name ?? `Cargo ${nextSequence()}`,
      deletedAt: overrides.deletedAt ?? null,
      rolePermissions: { createMany: { data: permissions.map((permission) => ({ permissionId: permission.id })) } },
    },
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
  /**
   * Ausente: o usuário recebe o cargo `Administrador` da empresa (catálogo inteiro). `[]`: sem cargo. Lista: um cargo
   * novo da empresa só com estas permissões.
   */
  permissions?: readonly PermissionName[];
  /** Vincula exatamente estes cargos (já criados na empresa), no lugar de `permissions`. */
  roleIds?: string[];
}

async function resolveRoleIds(companyId: string, overrides: UserOverrides): Promise<string[]> {
  if (overrides.roleIds) {
    return overrides.roleIds;
  }

  if (!overrides.permissions) {
    return [(await findAdminRole(companyId)).id];
  }

  if (overrides.permissions.length === 0) {
    return [];
  }

  return [(await createRole({ companyId, permissions: overrides.permissions })).id];
}

/** Usuário persistido com senha já hasheada. Cria uma empresa quando `companyId` não é informado. */
export async function createUser(overrides: UserOverrides = {}) {
  const companyId = overrides.companyId ?? (await createCompany()).id;
  const index = nextSequence();
  const roleIds = await resolveRoleIds(companyId, overrides);

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
      userRoles: { createMany: { data: roleIds.map((roleId) => ({ roleId })) } },
    },
  });
}

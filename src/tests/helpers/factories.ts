import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLE, type PermissionName } from "@/modules/permissions/permission.catalog";
import { createAdminRoleService } from "@/modules/permissions/services/createAdminRole.service";
import { type SystemConfigKey } from "@/modules/systemConfigs/systemConfig.catalog";

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

/** IDs das permissões do catálogo, na ordem dos nomes informados (o que `permissionIds` recebe). */
export async function findPermissionIds(names: readonly PermissionName[]): Promise<string[]> {
  const permissions = await Promise.all(
    names.map((name) => prisma.permission.findUniqueOrThrow({ where: { name }, select: { id: true } })),
  );

  return permissions.map((permission) => permission.id);
}

/** Nomes das permissões gravadas no cargo, em ordem alfabética. */
export async function findRolePermissionNames(roleId: string): Promise<string[]> {
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { name: true } } },
  });

  return rolePermissions.map((rolePermission) => rolePermission.permission.name).toSorted();
}

interface RoleOverrides {
  description?: string | null;
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
      description: overrides.description ?? null,
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
  /** Tempo de inatividade próprio; ausente ou null herda o da empresa. */
  idleTimeoutMinutes?: number | null;
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
      idleTimeoutMinutes: overrides.idleTimeoutMinutes ?? null,
      deletedAt: overrides.deletedAt ?? null,
      userRoles: { createMany: { data: roleIds.map((roleId) => ({ roleId })) } },
    },
  });
}

interface SystemConfigOverrides {
  companyId: string;
  key: SystemConfigKey;
  /** Gravado como está, sem passar pela validação da rota (para simular valor antigo ou inválido). */
  value: string;
}

/** Valor de configuração gravado pela empresa. */
export async function createSystemConfig({ companyId, key, value }: SystemConfigOverrides) {
  return prisma.systemConfig.create({ data: { companyId, key, value } });
}

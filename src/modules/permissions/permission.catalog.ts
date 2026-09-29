/**
 * Definição de uma permissão do catálogo. `name` segue `modulo.entidade.acao`, com a entidade em camelCase
 * (`backoffice.users.read`); os demais campos só servem para a tela de cargos agrupar e rotular.
 */
export interface PermissionDefinition {
  name: `${string}.${string}.${string}`;
  /** Agrupador de primeiro nível na tela de cargos. */
  module: string;
  /** Cabeçalho do grupo dentro do módulo (pt-BR). */
  groupLabel: string;
  action: string;
  /** Texto do checkbox na tela de cargos (pt-BR). */
  label: string;
  /** Ordem dentro do módulo: dezenas por grupo, unidades por ação. */
  sortOrder: number;
}

/**
 * Fonte única das permissões. Rota nova que precisa de permissão nova: acrescente aqui e rode a sincronização
 * (`npm run db:seed` em dev); ela cria a permissão e a concede só ao cargo `Administrador` de cada empresa.
 * Não renomeie um `name` existente: mova o antigo para `OBSOLETE_PERMISSION_NAMES` e crie o novo.
 */
export const PERMISSION_CATALOG = [
  {
    name: "backoffice.users.read",
    module: "backoffice",
    groupLabel: "Usuários",
    action: "read",
    label: "Visualizar usuários",
    sortOrder: 10,
  },
  {
    name: "backoffice.users.create",
    module: "backoffice",
    groupLabel: "Usuários",
    action: "create",
    label: "Criar usuário",
    sortOrder: 11,
  },
  {
    name: "backoffice.users.update",
    module: "backoffice",
    groupLabel: "Usuários",
    action: "update",
    label: "Editar usuário",
    sortOrder: 12,
  },
  {
    name: "backoffice.users.delete",
    module: "backoffice",
    groupLabel: "Usuários",
    action: "delete",
    label: "Excluir usuário",
    sortOrder: 13,
  },
  {
    name: "backoffice.roles.read",
    module: "backoffice",
    groupLabel: "Cargos",
    action: "read",
    label: "Visualizar cargos",
    sortOrder: 20,
  },
  {
    name: "backoffice.roles.create",
    module: "backoffice",
    groupLabel: "Cargos",
    action: "create",
    label: "Criar cargo",
    sortOrder: 21,
  },
  {
    name: "backoffice.roles.update",
    module: "backoffice",
    groupLabel: "Cargos",
    action: "update",
    label: "Editar cargo",
    sortOrder: 22,
  },
  {
    name: "backoffice.roles.delete",
    module: "backoffice",
    groupLabel: "Cargos",
    action: "delete",
    label: "Excluir cargo",
    sortOrder: 23,
  },
  {
    name: "backoffice.audit.read",
    module: "backoffice",
    groupLabel: "Auditoria",
    action: "read",
    label: "Visualizar trilha de auditoria",
    sortOrder: 30,
  },
  {
    name: "backoffice.systemConfigs.read",
    module: "backoffice",
    groupLabel: "Configurações",
    action: "read",
    label: "Visualizar configurações",
    sortOrder: 40,
  },
  {
    name: "backoffice.systemConfigs.update",
    module: "backoffice",
    groupLabel: "Configurações",
    action: "update",
    label: "Editar configurações",
    sortOrder: 41,
  },
] as const satisfies readonly PermissionDefinition[];

/** Nome de permissão válido. `requirePermission` só aceita estes: nome fora do catálogo não compila. */
export type PermissionName = (typeof PERMISSION_CATALOG)[number]["name"];

/** Módulo usado no catálogo. `PERMISSION_MODULES` só aceita estes: módulo fora do catálogo não compila. */
export type PermissionModule = (typeof PERMISSION_CATALOG)[number]["module"];

/**
 * Módulos do catálogo, na ordem da tela de cargos, com o rótulo pt-BR do cabeçalho de cada um
 * (`GET /roles/permissions`). Módulo novo no catálogo entra aqui também; o que faltar sai por último, rotulado pelo
 * próprio nome.
 */
export const PERMISSION_MODULES: readonly { module: PermissionModule; label: string }[] = [
  { module: "backoffice", label: "Backoffice" },
];

/** Todos os nomes do catálogo, na ordem de declaração. */
export const PERMISSION_NAMES: readonly PermissionName[] = PERMISSION_CATALOG.map((permission) => permission.name);

/**
 * Permissões descontinuadas: a sincronização as apaga do banco (e, em cascata, dos cargos). Um nome só entra aqui
 * depois de sair de `PERMISSION_CATALOG`.
 */
export const OBSOLETE_PERMISSION_NAMES: readonly string[] = [];

/** Cargo de sistema que toda empresa tem, com o catálogo inteiro. Recebe cada permissão nova na sincronização. */
export const ADMIN_ROLE = {
  name: "Administrador",
  description: "Acesso total a todas as permissões da empresa.",
} as const;

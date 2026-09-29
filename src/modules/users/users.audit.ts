import { toAuditListText } from "@/lib/audit/auditSnapshot";

/**
 * Estado "cargos do usuário" na trilha de auditoria, o mesmo pelos dois caminhos que o mudam (`PUT /users/:userId/roles`
 * e `PUT /roles/:roleId/users`): os nomes dos cargos em ordem alfabética, como texto (`null` sem nenhum cargo).
 */
export function toUserRolesAuditSnapshot(roleNames: readonly string[]): { roles: string | null } {
  return { roles: toAuditListText(roleNames.toSorted((left, right) => left.localeCompare(right, "pt-BR"))) };
}

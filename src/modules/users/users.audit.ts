import { toAuditListText } from "@/lib/audit/auditSnapshot";
import { type AuditFieldValues } from "@/modules/audit/audit.catalog";
import { type UserCrudRow } from "@/modules/users/users.select";

/**
 * Estado do usuário na trilha de auditoria (criação, edição), o mesmo da exclusão (`userSelect`): a linha cadastral,
 * sem o último acesso (carimbo do login, não mudança feita por alguém) nem os cargos (têm registro próprio, abaixo).
 */
export function toUserAuditState({ lastLoginAt: _lastLoginAt, userRoles: _userRoles, ...user }: UserCrudRow) {
  return user;
}

/**
 * Estado "cargos do usuário" na trilha de auditoria, o mesmo pelos dois caminhos que o mudam (`PUT /users/:userId/roles`
 * e `PUT /roles/:roleId/users`): os nomes dos cargos em ordem alfabética, como texto (`null` sem nenhum cargo).
 */
export function toUserRolesAuditSnapshot(roleNames: readonly string[]): { roles: string | null } {
  return {
    roles: toAuditListText(roleNames.toSorted((left, right) => left.localeCompare(right, "pt-BR"))),
  } satisfies AuditFieldValues<"User">;
}

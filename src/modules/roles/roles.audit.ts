import { toAuditListText } from "@/lib/audit/auditSnapshot";
import { type AuditFieldValues } from "@/modules/audit/audit.catalog";

interface AuditableRole {
  name: string;
  description: string | null;
  permissions: readonly { name: string }[];
}

/**
 * Estado do cargo na trilha de auditoria: nome, descrição e os nomes das permissões como texto (`null` sem nenhuma).
 * Recebe o cargo no formato de `toRoleDetail`, com as permissões já em ordem alfabética. Campo novo aqui precisa de
 * rótulo em `AUDIT_FIELD_LABELS` (o `satisfies` não compila sem ele).
 */
export function toRoleAuditSnapshot(role: AuditableRole) {
  return {
    name: role.name,
    description: role.description,
    permissions: toAuditListText(role.permissions.map((permission) => permission.name)),
  } satisfies AuditFieldValues<"Role">;
}

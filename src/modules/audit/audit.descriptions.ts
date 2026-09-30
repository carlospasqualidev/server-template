import { type AuditAction } from "@/generated/prisma/client";
import { type AuditEntity, type AuditExportFormat } from "@/modules/audit/audit.catalog";

/**
 * Frases da trilha de auditoria (`description`), num só lugar: verbo no passado e o registro afetado pelo nome, entre
 * aspas, como no sul-oxidos (`Criou o usuário "Maria Alves".`). O nome é o que identifica o registro para quem lê
 * (nome do usuário, do cargo, rótulo da configuração): nunca e-mail, senha, telefone ou outro dado além dele.
 *
 * Quem grava chama a frase da entidade e do evento (`AUDIT_DESCRIPTIONS.User.created(user.name)`); não escreva frase
 * no service. A frase sem nome, para anonimizar um registro, é `genericAuditDescription(entity, action)`.
 */

/** Nome do registro na frase: entre aspas, como o usuário o vê na tela. */
function quoted(name: string): string {
  return `"${name}"`;
}

type DescriptionBuilder = (...names: string[]) => string;

/** Frases por entidade e evento. Entidade nova entra aqui (o `satisfies` recusa a entidade do catálogo sem frases). */
export const AUDIT_DESCRIPTIONS = {
  User: {
    created: (name: string) => `Criou o usuário ${quoted(name)}.`,
    registered: (name: string) => `Criou a própria conta como ${quoted(name)}.`,
    updated: (name: string) => `Editou o usuário ${quoted(name)}.`,
    blocked: (name: string) => `Bloqueou o usuário ${quoted(name)}.`,
    unblocked: (name: string) => `Desbloqueou o usuário ${quoted(name)}.`,
    deleted: (name: string) => `Excluiu o usuário ${quoted(name)}.`,
    rolesChanged: (name: string) => `Alterou os cargos do usuário ${quoted(name)}.`,
    addedToRole: (name: string, roleName: string) => `Incluiu o usuário ${quoted(name)} no cargo ${quoted(roleName)}.`,
    removedFromRole: (name: string, roleName: string) =>
      `Retirou o usuário ${quoted(name)} do cargo ${quoted(roleName)}.`,
    // O autor é o próprio usuário: o nome já está na coluna do autor.
    loggedIn: () => "Entrou no sistema.",
  },
  Role: {
    created: (name: string) => `Criou o cargo ${quoted(name)}.`,
    copied: (sourceName: string, name: string) => `Copiou o cargo ${quoted(sourceName)} como ${quoted(name)}.`,
    updated: (name: string) => `Editou o cargo ${quoted(name)}.`,
    deleted: (name: string) => `Excluiu o cargo ${quoted(name)}.`,
  },
  SystemConfig: {
    // O rótulo do catálogo, não a chave técnica.
    updated: (label: string) => `Alterou a configuração ${quoted(label)}.`,
  },
} as const satisfies Record<AuditEntity, Record<string, DescriptionBuilder>>;

interface AuditEntityNouns {
  /** Com artigo indefinido, na frase sem nome: `um usuário` → `Criou um usuário.` */
  one: string;
  /** O conjunto, na exportação: `a lista de usuários` → `Exportou a lista de usuários em CSV.` */
  collection: string;
}

/** Substantivos da entidade nas frases sem nome. O `switch` exaustivo não compila sem a entidade nova. */
function auditEntityNouns(entity: AuditEntity): AuditEntityNouns {
  switch (entity) {
    case "User":
      return { one: "um usuário", collection: "a lista de usuários" };
    case "Role":
      return { one: "um cargo", collection: "a lista de cargos" };
    case "SystemConfig":
      return { one: "uma configuração", collection: "as configurações do sistema" };
  }
}

/** Frase da exportação: o que saiu e em qual formato. Sem dado pessoal (os filtros vão no `after`). */
export function exportAuditDescription(entity: AuditEntity, format: AuditExportFormat): string {
  return `Exportou ${auditEntityNouns(entity).collection} em ${format}.`;
}

/**
 * Frase genérica, sem nome, da ação sobre a entidade (`Criou um usuário.`): a que a anonimização grava no lugar da
 * frase com nome. Mais pobre que a original (edição e troca de cargos viram `Editou um usuário.`), de propósito: o
 * que mudou continua em `changedFields` e em `before`/`after`.
 */
export function genericAuditDescription(entity: AuditEntity, action: AuditAction): string {
  const nouns = auditEntityNouns(entity);

  switch (action) {
    case "create":
      return `Criou ${nouns.one}.`;
    case "update":
      return `Editou ${nouns.one}.`;
    case "delete":
      return `Excluiu ${nouns.one}.`;
    case "statusChange":
      return `Alterou o status de ${nouns.one}.`;
    case "login":
      return "Entrou no sistema.";
    case "export":
      return `Exportou ${nouns.collection}.`;
  }
}

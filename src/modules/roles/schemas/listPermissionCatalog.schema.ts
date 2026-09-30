import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { sessionSecurity } from "@/lib/http/security";

const catalogPermissionSchema = z.object({
  id: z.string().describe("ID da permissão (o que `permissionIds` recebe)."),
  name: z.string().describe("Nome estável, `modulo.entidade.acao`."),
  action: z.string().describe("Ação: `read` ou uma escrita (`create`, `update`, `delete`...)."),
  label: z.string().describe("Rótulo do checkbox (pt-BR)."),
});

const permissionGroupSchema = z.object({
  groupLabel: z.string().describe("Cabeçalho do grupo (pt-BR)."),
  permissions: z.array(catalogPermissionSchema),
});

const permissionModuleSchema = z.object({
  module: z.string().describe("Chave do módulo."),
  moduleLabel: z.string().describe("Cabeçalho do módulo (pt-BR)."),
  groups: z.array(permissionGroupSchema),
});

export const listPermissionCatalogResponseSchema = z.object({
  modules: z.array(permissionModuleSchema),
});

export const listPermissionCatalogRouteSchema = {
  tags: ["Roles"],
  summary: "Catálogo de permissões, agrupado para a tela de cargos",
  description:
    "Exige `backoffice.roles.read`. Árvore módulo → grupo → permissões, em ordem de exibição (`sortOrder`). O catálogo é global: igual para toda empresa.",
  security: sessionSecurity,
  response: {
    200: listPermissionCatalogResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
  },
};

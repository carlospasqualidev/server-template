import { z } from "zod";

import { paginationQuerySchema, sortQuerySchema } from "@/lib/http/pagination";
import { searchQuerySchema } from "@/lib/http/query";
import { errorResponseSchema } from "@/lib/http/responses";
import { roleListItemSchema } from "@/modules/roles/schemas/role.schemas";

/** Allowlist de ordenação: só estes campos chegam ao `orderBy` do Prisma. */
export const ROLE_SORT_FIELDS = ["name", "createdAt"] as const;

export const listRolesQuerySchema = paginationQuerySchema
  .extend(sortQuerySchema(ROLE_SORT_FIELDS, { orderBy: "name", order: "asc" }).shape)
  .extend({
    search: searchQuerySchema.describe("Busca por nome (contém, sem diferenciar maiúsculas)."),
  });

export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;

export const listRolesResponseSchema = z.object({
  roles: z.array(roleListItemSchema),
  count: z.number().int().describe("Total de registros que atendem ao filtro (para paginação)."),
});

export const listRolesRouteSchema = {
  tags: ["Roles"],
  summary: "Lista os cargos da empresa",
  description:
    "Paginação 0-based, ordenação por allowlist e busca por nome, com a contagem de permissões e de usuários de cada cargo. Cargos excluídos não aparecem. Exige `backoffice.roles.read`.",
  security: [{ cookieAuth: [] }],
  querystring: listRolesQuerySchema,
  response: {
    200: listRolesResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
  },
};

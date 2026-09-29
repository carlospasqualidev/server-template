import { z } from "zod";

import { paginationQuerySchema, sortQuerySchema } from "@/lib/http/pagination";
import { searchQuerySchema } from "@/lib/http/query";
import { errorResponseSchema } from "@/lib/http/responses";
import { roleParamsSchema } from "@/modules/roles/schemas/role.schemas";

/** Allowlist de ordenação: só estes campos chegam ao `orderBy` do Prisma. */
export const ROLE_USER_SORT_FIELDS = ["name", "email"] as const;

export const listRoleUsersQuerySchema = paginationQuerySchema
  .extend(sortQuerySchema(ROLE_USER_SORT_FIELDS, { orderBy: "name", order: "asc" }).shape)
  .extend({
    search: searchQuerySchema.describe("Busca por nome ou e-mail (contém, sem diferenciar maiúsculas)."),
  });

export type ListRoleUsersQuery = z.infer<typeof listRoleUsersQuerySchema>;

export const roleUserSchema = z.object({
  id: z.string().describe("Identificador do usuário."),
  name: z.string().describe("Nome."),
  email: z.string().describe("E-mail."),
  image: z.string().nullable().describe("URL da foto, ou null."),
  isActive: z.boolean().describe("Usuário bloqueado quando false (continua com o cargo)."),
});

export const listRoleUsersResponseSchema = z.object({
  users: z.array(roleUserSchema),
  count: z.number().int().describe("Total de registros que atendem ao filtro (para paginação)."),
});

export const listRoleUsersRouteSchema = {
  tags: ["Roles"],
  summary: "Lista os usuários de um cargo",
  description:
    "Exige `backoffice.roles.read` e `backoffice.users.read` (expõe nome e e-mail). Paginação 0-based, ordenação por allowlist e busca. Usuários bloqueados aparecem; excluídos, não.",
  security: [{ cookieAuth: [] }],
  params: roleParamsSchema,
  querystring: listRoleUsersQuerySchema,
  response: {
    200: listRoleUsersResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
  },
};

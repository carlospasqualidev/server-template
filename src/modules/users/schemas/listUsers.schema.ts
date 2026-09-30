import { z } from "zod";

import { paginationQuerySchema, sortQuerySchema } from "@/lib/http/pagination";
import { booleanQuerySchema, csvQuerySchema, dateTimeQuerySchema, searchQuerySchema } from "@/lib/http/query";
import { errorResponseSchema } from "@/lib/http/responses";
import { idSchema } from "@/lib/validation/schemas";
import { userSchema } from "@/modules/users/schemas/user.schemas";

/** Allowlist de ordenação: só estes campos chegam ao `orderBy` do Prisma. */
export const USER_SORT_FIELDS = ["name", "email", "createdAt", "lastLoginAt"] as const;

export const listUsersQuerySchema = paginationQuerySchema
  .extend(sortQuerySchema(USER_SORT_FIELDS, { orderBy: "name", order: "asc" }).shape)
  .extend({
    search: searchQuerySchema.describe("Busca por nome ou e-mail (contém, sem diferenciar maiúsculas)."),
    isActive: booleanQuerySchema.describe("Filtra por status: true (ativos) ou false (bloqueados)."),
    roleId: csvQuerySchema
      .pipe(z.array(idSchema).optional())
      .describe("Cargos (ids), separados por vírgula: usuários com qualquer um deles."),
    createdFrom: dateTimeQuerySchema.describe("Cadastrados a partir de (inclusivo), ISO 8601 em UTC."),
    createdTo: dateTimeQuerySchema.describe("Cadastrados até (inclusivo), ISO 8601 em UTC."),
  });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const listUsersResponseSchema = z.object({
  users: z.array(userSchema),
  count: z.number().int().describe("Total de registros que atendem ao filtro (para paginação)."),
});

export const listUsersRouteSchema = {
  tags: ["Users"],
  summary: "Lista os usuários da empresa",
  description:
    "Paginação 0-based, ordenação por allowlist (padrão `name asc`; `lastLoginAt` deixa quem nunca acessou no fim nos dois sentidos) e filtros, inclusive o período de cadastro (`createdFrom`/`createdTo`, inclusivos). Só usuários da empresa do usuário autenticado, com os cargos de cada um. Exige `backoffice.users.read`.",
  security: [{ cookieAuth: [] }],
  querystring: listUsersQuerySchema,
  response: {
    200: listUsersResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
  },
};

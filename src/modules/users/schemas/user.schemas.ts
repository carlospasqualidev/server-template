import { z } from "zod";

import { dateTimeOutputSchema } from "@/lib/http/responses";
import { idSchema } from "@/lib/validation/schemas";

const userIdentitySchema = z.object({
  id: z.string().describe("Identificador do usuário."),
  name: z.string().describe("Nome."),
  email: z.string().describe("E-mail."),
  image: z.string().nullable().describe("URL da foto, ou null."),
});

/** Forma mínima do usuário, usada na sessão (login, register, /me). Espelha o `IUser` do frontend. */
export const userSummarySchema = userIdentitySchema.extend({
  permissions: z
    .array(z.string())
    .describe(
      "Permissões efetivas (união dos cargos do usuário), em ordem alfabética. O frontend decide menu e botões por `includes`; o backend é quem autoriza.",
    )
    .meta({ examples: [["backoffice.users.create", "backoffice.users.read"]] }),
});

/** Forma completa do usuário, usada no CRUD. */
export const userSchema = userIdentitySchema.extend({
  phone: z.string().nullable().describe("Telefone, ou null."),
  isActive: z.boolean().describe("Usuário bloqueado quando false."),
  createdAt: dateTimeOutputSchema,
  updatedAt: dateTimeOutputSchema,
});

export const userParamsSchema = z.object({
  userId: idSchema.describe("ID do usuário."),
});

export type UserParams = z.infer<typeof userParamsSchema>;

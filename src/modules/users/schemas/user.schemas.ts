import { z } from "zod";

import { dateTimeOutputSchema } from "@/lib/http/responses";
import { idSchema } from "@/lib/validation/schemas";

/** Forma mínima do usuário, usada na sessão (login, register, /me). Espelha o `IUser` do frontend. */
export const userSummarySchema = z.object({
  id: z.string().describe("Identificador do usuário."),
  name: z.string().describe("Nome."),
  email: z.string().describe("E-mail."),
  image: z.string().nullable().describe("URL da foto, ou null."),
});

/** Forma completa do usuário, usada no CRUD. */
export const userSchema = userSummarySchema.extend({
  phone: z.string().nullable().describe("Telefone, ou null."),
  isActive: z.boolean().describe("Usuário bloqueado quando false."),
  createdAt: dateTimeOutputSchema,
  updatedAt: dateTimeOutputSchema,
});

export const userParamsSchema = z.object({
  userId: idSchema.describe("ID do usuário."),
});

export type UserParams = z.infer<typeof userParamsSchema>;

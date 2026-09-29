import { z } from "zod";

import { IDLE_TIMEOUT_MINUTES_RANGE } from "@/config/constants";
import { dateTimeOutputSchema } from "@/lib/http/responses";
import { idSchema } from "@/lib/validation/schemas";
import { roleSummarySchema } from "@/modules/roles/schemas/role.schemas";

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
  idleTimeoutMinutes: z
    .number()
    .int()
    .describe(
      "Minutos sem atividade até o logout automático no cliente, já resolvidos: o do cadastro do usuário, senão o da empresa (`security.idleTimeoutMinutes`), senão 20. O servidor não impõe: a sessão vale até expirar.",
    )
    .meta({ examples: [20] }),
});

/** Forma completa do usuário, usada no CRUD (lista, detalhe, criação, edição). */
export const userSchema = userIdentitySchema.extend({
  phone: z.string().nullable().describe("Telefone, ou null."),
  isActive: z
    .boolean()
    .describe("Status do acesso: true ativo, false bloqueado. Não há outro campo de status: o cliente deriva daqui."),
  idleTimeoutMinutes: z
    .number()
    .int()
    .nullable()
    .describe(
      "Tempo de inatividade próprio do usuário, em minutos; null herda o da empresa. O valor que vale sai já resolvido na sessão.",
    ),
  lastLoginAt: dateTimeOutputSchema
    .nullable()
    .describe(
      "Última abertura de sessão (login bem-sucedido ou register), ISO 8601 UTC; null quando o usuário nunca acessou.",
    ),
  roles: z
    .array(roleSummarySchema.pick({ id: true, name: true }))
    .describe("Cargos do usuário (não excluídos, da empresa dele), em ordem alfabética do nome. `[]` sem cargo."),
  createdAt: dateTimeOutputSchema,
  updatedAt: dateTimeOutputSchema,
});

const IDLE_TIMEOUT_MESSAGE = `Informe um tempo de inatividade inteiro de ${IDLE_TIMEOUT_MINUTES_RANGE.min} a ${IDLE_TIMEOUT_MINUTES_RANGE.max} minutos.`;

/** Tempo de inatividade próprio do usuário no corpo (criação e edição). `null` herda o da empresa. */
export const idleTimeoutMinutesBodySchema = z
  .number({ message: IDLE_TIMEOUT_MESSAGE })
  .int(IDLE_TIMEOUT_MESSAGE)
  .min(IDLE_TIMEOUT_MINUTES_RANGE.min, IDLE_TIMEOUT_MESSAGE)
  .max(IDLE_TIMEOUT_MINUTES_RANGE.max, IDLE_TIMEOUT_MESSAGE)
  .nullable();

export const userParamsSchema = z.object({
  userId: idSchema.describe("ID do usuário."),
});

export type UserParams = z.infer<typeof userParamsSchema>;

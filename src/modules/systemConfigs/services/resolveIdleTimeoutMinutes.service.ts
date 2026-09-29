import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSystemConfigValueService } from "@/modules/systemConfigs/services/getSystemConfigValue.service";

interface ResolveIdleTimeoutMinutesInput {
  companyId: string;
  /** O do cadastro do usuário (`User.idleTimeoutMinutes`); null herda o da empresa. */
  userIdleTimeoutMinutes: number | null;
}

/**
 * Tempo de inatividade até o logout que vale para o usuário, na cascata: o do cadastro dele, senão o da empresa
 * (`security.idleTimeoutMinutes`), senão o padrão do catálogo (20). Vai na sessão (login, register, `/users/me`); quem
 * aplica é o cliente, o servidor não impõe.
 */
export async function resolveIdleTimeoutMinutesService(
  { companyId, userIdleTimeoutMinutes }: ResolveIdleTimeoutMinutesInput,
  client: Prisma.TransactionClient = prisma,
): Promise<number> {
  return (
    userIdleTimeoutMinutes ?? getSystemConfigValueService({ companyId, key: "security.idleTimeoutMinutes" }, client)
  );
}

import { assertExists } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { resolveIdleTimeoutMinutesService } from "@/modules/systemConfigs/services/resolveIdleTimeoutMinutes.service";
import { userSummarySelect } from "@/modules/users/users.select";

export async function findCurrentUserService(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, ...notDeleted },
    select: { ...userSummarySelect, companyId: true, idleTimeoutMinutes: true },
  });

  assertExists(user, "Usuário");

  const { companyId, idleTimeoutMinutes: userIdleTimeoutMinutes, ...summary } = user;

  return {
    ...summary,
    idleTimeoutMinutes: await resolveIdleTimeoutMinutesService({ companyId, userIdleTimeoutMinutes }),
  };
}

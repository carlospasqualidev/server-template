import { assertExists } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";

interface FindCurrentUserProfileInput {
  companyId: string;
  /** O usuário da sessão: ninguém lê o perfil de outro por aqui. */
  userId: string;
}

/** Perfil editável do próprio usuário, com o tempo de inatividade gravado (não o resolvido). */
export async function findCurrentUserProfileService({ companyId, userId }: FindCurrentUserProfileInput) {
  const profile = await prisma.user.findFirst({
    where: { id: userId, companyId, ...notDeleted },
    select: { name: true, email: true, phone: true, image: true, idleTimeoutMinutes: true },
  });

  assertExists(profile, "Usuário");

  return profile;
}

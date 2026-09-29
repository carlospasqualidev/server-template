import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { findEffectivePermissionsService } from "@/modules/permissions/services/findEffectivePermissions.service";

let fallbackHash: Promise<string> | undefined;

/** Hash comparado quando o e-mail não existe, para o tempo de resposta não revelar se a conta existe. */
function getFallbackHash(): Promise<string> {
  fallbackHash ??= hashPassword("fallback-password");

  return fallbackHash;
}

export async function authenticateUserService({ email, password }: { email: string; password: string }) {
  const user = await prisma.user.findFirst({
    where: { email, ...notDeleted },
    select: { id: true, companyId: true, name: true, email: true, image: true, password: true, isActive: true },
  });

  const passwordMatches = await verifyPassword(password, user?.password ?? (await getFallbackHash()));

  if (!user || !passwordMatches) {
    throw new UnauthorizedError("Credenciais inválidas.");
  }

  if (!user.isActive) {
    throw new ForbiddenError("Sua conta está bloqueada.");
  }

  // Lidas só depois da senha conferida: a consulta das credenciais custa o mesmo exista o e-mail ou não.
  const permissions = await findEffectivePermissionsService({ userId: user.id, companyId: user.companyId });

  return { id: user.id, name: user.name, email: user.email, image: user.image, permissions };
}

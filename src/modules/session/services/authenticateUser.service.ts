import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { notDeleted, prisma } from "@/lib/prisma";
import { recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { findEffectivePermissionsService } from "@/modules/permissions/services/findEffectivePermissions.service";
import { resolveIdleTimeoutMinutesService } from "@/modules/systemConfigs/services/resolveIdleTimeoutMinutes.service";

let fallbackHash: Promise<string> | undefined;

/** Hash comparado quando o e-mail não existe, para o tempo de resposta não revelar se a conta existe. */
function getFallbackHash(): Promise<string> {
  fallbackHash ??= hashPassword("fallback-password");

  return fallbackHash;
}

export async function authenticateUserService({ email, password }: { email: string; password: string }) {
  const user = await prisma.user.findFirst({
    where: { email, ...notDeleted },
    select: {
      id: true,
      companyId: true,
      name: true,
      email: true,
      image: true,
      password: true,
      isActive: true,
      idleTimeoutMinutes: true,
    },
  });

  const passwordMatches = await verifyPassword(password, user?.password ?? (await getFallbackHash()));

  if (!user || !passwordMatches) {
    throw new UnauthorizedError("Credenciais inválidas.");
  }

  if (!user.isActive) {
    throw new ForbiddenError("Sua conta está bloqueada.");
  }

  // Login bem-sucedido entra na trilha, com o próprio usuário como autor (a rota é pública, não há sessão ainda). Numa
  // transação para o que mais o login gravar (ex.: último acesso) confirmar junto com o registro.
  await prisma.$transaction(async (tx) => {
    await recordAuditService(
      {
        companyId: user.companyId,
        module: "SECURITY",
        entity: "User",
        entityId: user.id,
        action: "login",
        description: "Entrou no sistema",
        userId: user.id,
      },
      tx,
    );
  });

  // Lidos só depois da senha conferida: a consulta das credenciais custa o mesmo exista o e-mail ou não.
  const [permissions, idleTimeoutMinutes] = await Promise.all([
    findEffectivePermissionsService({ userId: user.id, companyId: user.companyId }),
    resolveIdleTimeoutMinutesService({ companyId: user.companyId, userIdleTimeoutMinutes: user.idleTimeoutMinutes }),
  ]);

  return { id: user.id, name: user.name, email: user.email, image: user.image, permissions, idleTimeoutMinutes };
}

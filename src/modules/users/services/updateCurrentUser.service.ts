import { BadRequestError } from "@/lib/errors";
import { getSystemConfigValueService } from "@/modules/systemConfigs/services/getSystemConfigValue.service";
import { resolveIdleTimeoutMinutesService } from "@/modules/systemConfigs/services/resolveIdleTimeoutMinutes.service";
import { type UpdateCurrentUserBody } from "@/modules/users/schemas/updateCurrentUser.schema";
import { updateUserService } from "@/modules/users/services/updateUser.service";

interface UpdateCurrentUserInput {
  companyId: string;
  /** O usuário da sessão: ninguém edita outro por aqui. */
  userId: string;
  data: UpdateCurrentUserBody;
}

/**
 * No autoatendimento o tempo de inatividade próprio só pode encurtar o da empresa (`security.idleTimeoutMinutes`, o
 * gravado ou o padrão): quem quer mais tempo pede ao administrador, que pelo CRUD grava de 1 a 480. `null` (herdar)
 * sempre passa.
 */
async function assertIdleTimeoutWithinCompanyLimit(companyId: string, idleTimeoutMinutes: number | null | undefined) {
  if (idleTimeoutMinutes === undefined || idleTimeoutMinutes === null) {
    return;
  }

  const companyLimit = await getSystemConfigValueService({ companyId, key: "security.idleTimeoutMinutes" });

  if (idleTimeoutMinutes > companyLimit) {
    throw new BadRequestError(
      `O tempo de inatividade pode ser de no máximo ${companyLimit} minutos, o limite definido pela empresa.`,
    );
  }
}

/**
 * Autoatendimento do perfil: a mesma edição de `PATCH /users/:userId` (trava da linha, "antes" exato e o registro
 * `USERS` / `User` / `update` na mesma transação, com o próprio usuário como autor), restrita pelo schema aos campos do
 * perfil e, no tempo de inatividade, ao limite da empresa. Devolve o usuário no formato da sessão, com o tempo de
 * inatividade resolvido; as permissões são as da requisição (a edição do perfil não as muda).
 */
export async function updateCurrentUserService({ companyId, userId, data }: UpdateCurrentUserInput) {
  await assertIdleTimeoutWithinCompanyLimit(companyId, data.idleTimeoutMinutes);

  const { id, name, email, image, idleTimeoutMinutes } = await updateUserService({ companyId, userId, data });

  return {
    id,
    name,
    email,
    image,
    idleTimeoutMinutes: await resolveIdleTimeoutMinutesService({
      companyId,
      userIdleTimeoutMinutes: idleTimeoutMinutes,
    }),
  };
}

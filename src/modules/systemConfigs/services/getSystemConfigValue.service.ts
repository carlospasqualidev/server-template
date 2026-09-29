import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  findSystemConfigDefinition,
  type SystemConfigKey,
  type SystemConfigValue,
} from "@/modules/systemConfigs/systemConfig.catalog";
import { resolveSystemConfigValue } from "@/modules/systemConfigs/systemConfig.definition";

interface GetSystemConfigValueInput<TKey extends SystemConfigKey> {
  companyId: string;
  key: TKey;
}

/**
 * Valor de uma configuração da empresa, já no tipo do catálogo (`number` em `int`, `boolean` em `boolean`): o gravado
 * ou, sem gravação, o padrão. É a leitura para o código; a tela usa `GET /system-configs`. Aceita `tx`.
 *
 * @example
 * const minutes = await getSystemConfigValueService({ companyId, key: "security.idleTimeoutMinutes" }); // number
 */
export async function getSystemConfigValueService<TKey extends SystemConfigKey>(
  { companyId, key }: GetSystemConfigValueInput<TKey>,
  client: Prisma.TransactionClient = prisma,
): Promise<SystemConfigValue<TKey>> {
  const storedConfig = await client.systemConfig.findUnique({
    where: { companyId_key: { companyId, key } },
    select: { value: true },
  });

  // `resolveSystemConfigValue` converte pelo `valueType` desta mesma chave: o tipo é o que o catálogo declara.
  return resolveSystemConfigValue(findSystemConfigDefinition(key), storedConfig?.value) as SystemConfigValue<TKey>;
}

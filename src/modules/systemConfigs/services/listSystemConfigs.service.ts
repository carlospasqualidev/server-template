import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { SYSTEM_CONFIG_CATALOG, SYSTEM_CONFIG_KEYS } from "@/modules/systemConfigs/systemConfig.catalog";
import { resolveSystemConfigValue, serializeSystemConfigValue } from "@/modules/systemConfigs/systemConfig.definition";

/**
 * Catálogo inteiro, na ordem da tela, com o valor efetivo da empresa. A leitura se limita às chaves do catálogo (uma
 * linha por chave, pelo índice único), por isso não é paginada; valor de chave que saiu do catálogo fica de fora.
 */
export async function listSystemConfigsService(
  { companyId }: { companyId: string },
  client: Prisma.TransactionClient = prisma,
) {
  const storedConfigs = await client.systemConfig.findMany({
    where: { companyId, key: { in: [...SYSTEM_CONFIG_KEYS] } },
    select: { key: true, value: true },
  });
  const storedValues = new Map(storedConfigs.map((config) => [config.key, config.value]));

  return SYSTEM_CONFIG_CATALOG.map((definition) => ({
    key: definition.key,
    module: definition.module,
    label: definition.label,
    description: definition.description,
    valueType: definition.valueType,
    value: serializeSystemConfigValue(
      definition,
      resolveSystemConfigValue(definition, storedValues.get(definition.key)),
    ),
  }));
}

import { prisma } from "@/lib/prisma";
import { type UpdateSystemConfigsBody } from "@/modules/systemConfigs/schemas/updateSystemConfigs.schema";
import { listSystemConfigsService } from "@/modules/systemConfigs/services/listSystemConfigs.service";
import { SYSTEM_CONFIG_KEYS } from "@/modules/systemConfigs/systemConfig.catalog";

interface UpdateSystemConfigsInput {
  companyId: string;
  /** Itens já validados e normalizados pelo schema da rota, cada chave uma vez. */
  items: UpdateSystemConfigsBody["items"];
}

/** Grava o lote numa transação (tudo ou nada) e devolve a lista completa, lida pelo mesmo `tx`. */
export async function updateSystemConfigsService({ companyId, items }: UpdateSystemConfigsInput) {
  // Ordem do catálogo: dois lotes simultâneos da mesma empresa travam as linhas na mesma ordem, sem deadlock.
  const orderedItems = items.toSorted(
    (left, right) => SYSTEM_CONFIG_KEYS.indexOf(left.key) - SYSTEM_CONFIG_KEYS.indexOf(right.key),
  );

  return prisma.$transaction(async (tx) => {
    for (const { key, value } of orderedItems) {
      await tx.systemConfig.upsert({
        where: { companyId_key: { companyId, key } },
        create: { companyId, key, value },
        update: { value },
        select: { id: true },
      });
    }

    return listSystemConfigsService({ companyId }, tx);
  });
}

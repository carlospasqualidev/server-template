import { BadRequestError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { AUDIT_DESCRIPTIONS } from "@/modules/audit/audit.descriptions";
import { type AuditEntry, recordAuditService } from "@/modules/audit/services/recordAudit.service";
import { type UpdateSystemConfigsBody } from "@/modules/systemConfigs/schemas/updateSystemConfigs.schema";
import { listSystemConfigsService } from "@/modules/systemConfigs/services/listSystemConfigs.service";
import {
  crossKeyRuleMessage,
  findSystemConfigDefinition,
  SYSTEM_CONFIG_CROSS_KEY_RULES,
  SYSTEM_CONFIG_KEYS,
  systemConfigValueReader,
} from "@/modules/systemConfigs/systemConfig.catalog";
import { resolveSystemConfigValue, serializeSystemConfigValue } from "@/modules/systemConfigs/systemConfig.definition";

interface UpdateSystemConfigsInput {
  companyId: string;
  /** Itens já validados e normalizados pelo schema da rota, cada chave uma vez. */
  items: UpdateSystemConfigsBody["items"];
}

/**
 * Nome da trava consultiva dos lotes de configuração de uma empresa (`hashtext` dele é a chave). Exportado para o
 * teste de corrida tomar a mesma trava.
 */
export function systemConfigsLockName(companyId: string): string {
  return `system-configs:${companyId}`;
}

/**
 * Grava o lote numa transação (tudo ou nada), registra na trilha de auditoria cada chave que mudou (antes e depois
 * efetivos, o padrão quando não havia valor gravado) e devolve a lista completa, lida pelo mesmo `tx`. Antes de gravar,
 * confere as regras entre chaves que o lote toca contra o resultado (o valor do lote, senão o gravado, senão o padrão):
 * 400 sem gravar nada.
 */
export async function updateSystemConfigsService({ companyId, items }: UpdateSystemConfigsInput) {
  // Ordem do catálogo: as linhas são gravadas (e os registros da trilha saem) na ordem da tela.
  const orderedItems = items.toSorted(
    (left, right) => SYSTEM_CONFIG_KEYS.indexOf(left.key) - SYSTEM_CONFIG_KEYS.indexOf(right.key),
  );

  return prisma.$transaction(async (tx) => {
    // Trava consultiva da empresa, primeiro comando da transação: lotes simultâneos da mesma empresa se revezam e cada
    // um lê como "antes" o que o anterior confirmou (sem ela, os dois leriam o mesmo valor e a trilha mentiria). Só a
    // chave muda de empresa para empresa: lotes de empresas diferentes não se esperam. `$executeRaw` porque a função
    // devolve `void`; a trava se solta sozinha no fim da transação.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${systemConfigsLockName(companyId)}))`;

    // Regras entre chaves que o lote toca: leem também as chaves de fora do lote, pelo valor já gravado (ou o padrão).
    const batchKeys = new Set<string>(orderedItems.map((item) => item.key));
    const crossKeyRules = SYSTEM_CONFIG_CROSS_KEY_RULES.filter((rule) => rule.keys.some((key) => batchKeys.has(key)));

    // Limitado pelo catálogo (uma linha por chave, pelo índice único): as do lote e as que as regras leem.
    const storedConfigs = await tx.systemConfig.findMany({
      where: { companyId, key: { in: [...new Set([...batchKeys, ...crossKeyRules.flatMap((rule) => rule.keys)])] } },
      select: { key: true, value: true },
    });
    const storedValues = new Map(storedConfigs.map((config) => [config.key, config.value]));

    const readValueAfter = systemConfigValueReader(
      new Map([...storedValues, ...orderedItems.map((item): [string, string] => [item.key, item.value])]),
    );
    const brokenRule = crossKeyRules.find((rule) => !rule.isSatisfied(readValueAfter));

    if (brokenRule) {
      throw new BadRequestError(crossKeyRuleMessage(brokenRule));
    }

    for (const { key, value } of orderedItems) {
      await tx.systemConfig.upsert({
        where: { companyId_key: { companyId, key } },
        create: { companyId, key, value },
        update: { value },
        select: { id: true },
      });
    }

    // Um registro por chave alterada: o antes e o depois já normalizados se comparam como texto, e a chave enviada
    // sem mudança não gera registro (`update` sem campo alterado não é gravado).
    await recordAuditService(
      orderedItems.map(({ key, value }): AuditEntry<"SystemConfig"> => {
        const definition = findSystemConfigDefinition(key);

        return {
          companyId,
          module: "SETTINGS",
          entity: "SystemConfig",
          entityId: key,
          action: "update",
          description: AUDIT_DESCRIPTIONS.SystemConfig.updated(definition.label),
          before: {
            value: serializeSystemConfigValue(definition, resolveSystemConfigValue(definition, storedValues.get(key))),
          },
          after: { value },
          redactedFields: definition.redactInAudit ? ["value"] : [],
        };
      }),
      tx,
    );

    return listSystemConfigsService({ companyId }, tx);
  });
}

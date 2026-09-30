/**
 * Data de corte de um prazo de retenção: `now` menos `months` meses do calendário, em UTC, com a mesma hora. O dia que
 * não existe no mês de destino vira o último dia dele (31/03 menos 1 mês é 28/02, ou 29/02 no ano bissexto). O evento
 * com `createdAt` anterior ao corte passou do prazo.
 */
export function auditRetentionCutoff(now: Date, months: number): Date {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();

  // Dia 1 antes de trocar o mês: sem isso, 31/03 menos 1 mês viraria 31/02, que o `Date` leva para 03/03.
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);

  const lastDayOfMonth = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDayOfMonth));

  return cutoff;
}

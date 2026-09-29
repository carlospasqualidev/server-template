import { checkNaN } from '../validator';

export function handleQueryTake(take: string | undefined, maxTake?: number) {
  checkNaN([{ label: 'Número de registros', number: take }]);

  return Math.min(Math.abs(Number(take || 20)), maxTake || 100);
}

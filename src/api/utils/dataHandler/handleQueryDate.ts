import { checkValues } from '../validator';

export function handleQueryDate({ date, label }: { date: string | undefined | null; label: string }) {
  checkValues([{ label, type: 'date', value: date || null, required: false }]);

  return date || undefined;
}

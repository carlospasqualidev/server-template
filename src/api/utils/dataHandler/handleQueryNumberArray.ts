import { checkNaN, checkValues } from '../validator';

interface IHandleQueryArray {
  value: string | string[] | undefined;
  type: 'int' | 'float';
  label: string;
}

export function handleQueryNumberArray({ value, type, label }: IHandleQueryArray) {
  const filter = Array.isArray(value) ? value : value ? [value] : undefined;

  checkValues([{ label, type: 'array', value: filter, required: false }]);

  filter?.forEach((data) => {
    checkNaN([{ label, number: data }]);
    checkValues([{ label, type, value: +data }]);
  });

  return filter?.map(parseFloat);
}

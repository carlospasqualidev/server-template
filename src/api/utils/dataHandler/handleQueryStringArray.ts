import { checkValues } from '../validator';

interface IHandleQueryArray {
  value: string | string[] | undefined;
  label: string;
}

export function handleQueryStringArray({ value, label }: IHandleQueryArray) {
  const filter = Array.isArray(value) ? value : value ? [value] : undefined;

  checkValues([{ label, type: 'array', value: filter, required: false }]);

  filter?.forEach((data) => {
    checkValues([{ label, type: 'string', value: data }]);
  });

  return filter;
}

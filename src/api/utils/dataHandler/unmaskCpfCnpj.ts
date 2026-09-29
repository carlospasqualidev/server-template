export function unmaskCpfCnpj(value: string): string {
  return value.replace(/[./-]/g, '');
}

/** Remove tudo que não é dígito: `"123.456.789-01"` → `"12345678901"`. Serve para CPF, CNPJ, CEP e telefone. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** `"1.234,56"` → `"1234.56"`: converte número formatado em pt-BR para o formato aceito por `Number()`. */
export function decimalFromPtBr(value: string): string {
  return value.replace(/\./g, "").replace(",", ".");
}

/** `"1234.56"` → `"1234,56"`. */
export function decimalToPtBr(value: string | number): string {
  return String(value).replace(".", ",");
}

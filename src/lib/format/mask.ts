type MaskType = "CPF" | "CNPJ" | "PHONE" | "CEP" | "BRL";

function maskCpf(digits: string): string {
  return digits
    .replace(/^(\d{9})(\d)/g, "$1-$2")
    .replace(/^(\d{6})(\d)/g, "$1.$2")
    .replace(/^(\d{3})(\d)/g, "$1.$2")
    .substring(0, 14);
}

function maskCnpj(digits: string): string {
  return digits
    .replace(/^(\d{12})(\d)/g, "$1-$2")
    .replace(/^(\d{8})(\d)/g, "$1/$2")
    .replace(/^(\d{5})(\d)/g, "$1.$2")
    .replace(/^(\d{2})(\d)/g, "$1.$2")
    .substring(0, 18);
}

function maskCep(digits: string): string {
  return digits.replace(/^(\d{5})(\d)/g, "$1-$2").substring(0, 9);
}

function maskPhone(digits: string): string {
  return digits
    .replace(/^(\d{2})(\d)/g, "($1) $2")
    .replace(/(\d)(\d{4})$/, "$1-$2")
    .substring(0, 15);
}

function maskBrl(digits: string): string {
  const valueInCents = Number(digits || 0);

  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100);
}

/**
 * Aplica máscara pt-BR a um valor cru (só dígitos são considerados).
 * `BRL` interpreta o valor em centavos: `mask("BRL", 123456)` → `R$ 1.234,56`.
 */
export function mask(type: MaskType, value: string | number): string {
  const digits = String(value).replace(/\D/g, "");

  switch (type) {
    case "CPF":
      return maskCpf(digits);
    case "CNPJ":
      return maskCnpj(digits);
    case "CEP":
      return maskCep(digits);
    case "PHONE":
      return maskPhone(digits);
    case "BRL":
      return maskBrl(digits);
  }
}

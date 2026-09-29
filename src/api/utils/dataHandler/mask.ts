export function mask({ type, value }: { type: "CPF" | "CNPJ" | "TEL" | "CEP" | "BRL"; value: string | number }) {
  let formattedValue = "";
  const newValue = type === "BRL" && typeof value === "number" ? Math.round(value).toString() : String(value);

  switch (type) {
    case "CPF":
      formattedValue = newValue
        .replace(/\D/g, "")
        .replace(/^(\d{9})(\d)/g, "$1-$2")
        .replace(/^(\d{6})(\d)/g, "$1.$2")
        .replace(/^(\d{3})(\d)/g, "$1.$2")
        .substring(0, 14);
      break;

    case "CNPJ":
      formattedValue = newValue
        .replace(/\D/g, "")
        .replace(/^(\d{12})(\d)/g, "$1-$2")
        .replace(/^(\d{8})(\d)/g, "$1/$2")
        .replace(/^(\d{5})(\d)/g, "$1.$2")
        .replace(/^(\d{2})(\d)/g, "$1.$2")
        .substring(0, 18);
      break;

    case "CEP":
      formattedValue = newValue
        .replace(/\D/g, "")
        .replace(/^(\d{5})(\d)/g, "$1-$2")
        .substring(0, 9);
      break;

    case "TEL":
      formattedValue = newValue
        .replace(/\D/g, "")
        .replace(/^(\d{2})(\d)/g, "($1) $2")
        .replace(/(\d)(\d{4})$/, "$1-$2")
        .substring(0, 15);
      break;

    case "BRL":
      {
        const rawValue = newValue === null || newValue === undefined ? "" : String(newValue);

        const onlyNumbers = rawValue.replace(/\D/g, "");
        const valueInCents = Number(onlyNumbers || 0);

        formattedValue = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(valueInCents / 100);
      }
      break;

    default:
      break;
  }
  return formattedValue;
}

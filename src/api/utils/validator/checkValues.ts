import { ErrorMessage } from "../error";

type IType =
  | "string"
  | "int"
  | "float"
  | "boolean"
  | "date"
  | "dateTime"
  | "json"
  | "array"
  | "time"
  | "email"
  | "CEP"
  | "CPF"
  | "CNPJ"
  | "stringForUrl"
  | "username"
  | "stringNumbers"
  | "phone";

interface ICheckValues {
  value: any;
  label: string;
  type: IType;
  required?: boolean;
  allowZero?: boolean;
}

const labelToDisplay: Record<IType, string> = {
  string: "Texto",
  int: "Número inteiro",
  float: "Número",
  dateTime: "Data e hora",
  date: "Data",
  time: "Hora",
  array: "Array",
  boolean: "Booleano",
  json: "JSON",
  email: "Email",
  CEP: "CEP",
  CPF: "CPF",
  CNPJ: "CNPJ",
  stringForUrl: "Texto",
  username: "Nome de usuário",
  stringNumbers: "Texto numérico",
  phone: "Telefone/Celular",
};

function invalidType({ label, type }: { label: string; type: IType }) {
  throw new ErrorMessage({
    statusCode: "400 BAD REQUEST",
    message: `A informação ${label} deve possuir o tipo ${labelToDisplay[type]}.`,
  });
}

function invalidTypeLength({ label, type }: { label: string; type: IType }) {
  throw new ErrorMessage({
    statusCode: "400 BAD REQUEST",
    message: `A informação ${label} ultrapassa o tamanho do tipo ${labelToDisplay[type]}.`,
  });
}

function invalidTime(time: string) {
  const hourFormat = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

  if (hourFormat.test(time)) {
    const hourMinute = time.split(":");
    const hour = Number(hourMinute[0]);
    const minute = Number(hourMinute[1]);

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return true;
    }
  }
  return false;
}

function checkString({ label, value }: { label: string; value: any }) {
  if (typeof value !== "string") {
    invalidType({ label, type: "string" });
  }
}

function isValidIsoUtcDate(dateStr: string): boolean {
  // Regex para validar o formato ISO 8601 (apenas datas UTC com 'Z')
  const isoUtcRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

  if (!isoUtcRegex.test(dateStr)) {
    return false;
  }

  const date = new Date(dateStr);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return dateStr.endsWith("Z");
}

function isValidDateWithoutTime(dateStr: string): boolean {
  const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

  if (!dateRegex.test(dateStr)) {
    return false;
  }

  const date = new Date(dateStr);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return true;
}

export function checkValues(values: ICheckValues[]) {
  for (let index = 0; index < values.length; index++) {
    const { label, type, value, allowZero = false, required = true } = values[index];

    if (required && (value === null || value === undefined || value === "")) {
      throw new ErrorMessage({
        statusCode: "400 BAD REQUEST",
        message: `Verifique o valor da informação ${label} e tente novamente.`,
      });
    }

    if (!allowZero && value === 0) {
      throw new ErrorMessage({
        statusCode: "400 BAD REQUEST",
        message: `A informação ${label} não pode ser zero.`,
      });
    }

    if (!required && (value === null || value === undefined)) continue;

    switch (type) {
      case "string":
        if (typeof value !== "string") {
          invalidType({ label, type });
        }
        break;

      case "int":
        if (typeof value !== "number") {
          invalidType({ label, type });
        }

        if (!Number.isInteger(value)) {
          invalidType({ label, type });
        }

        if (value > 2147483647 || value < -2147483648) {
          invalidTypeLength({ label, type });
        }
        break;

      case "float":
        if (typeof value !== "number") {
          invalidType({ label, type });
        }

        if (value > 3.4e38 || value < -3.4e38) {
          invalidTypeLength({ label, type });
        }
        break;

      case "boolean":
        // nunca vai entrar aqui se vier null ou undefined, por causa do if acima
        if (typeof value !== "boolean") {
          invalidType({ label, type });
        }
        break;

      case "date": {
        if (typeof value === "number") {
          invalidType({ label, type });
        }

        const checkDate = new Date(value);
        const isDateWithoutTime = isValidDateWithoutTime(value);

        if (!isDateWithoutTime) {
          invalidType({ label, type });
        }

        const minDate = new Date("1000/01/01");
        const maxDate = new Date("9999/12/31");

        if (checkDate <= minDate) {
          throw new ErrorMessage({
            statusCode: "400 BAD REQUEST",
            message: `A informação ${label} deve ser maior que 01/01/1000`,
          });
        }

        if (checkDate >= maxDate) {
          throw new ErrorMessage({
            statusCode: "400 BAD REQUEST",
            message: `A informação ${label} deve ser menor que 31/12/9999`,
          });
        }

        break;
      }

      case "dateTime": {
        if (typeof value === "number") {
          invalidType({ label, type });
        }

        const checkDate = new Date(value);
        const isIsoUtcDate = isValidIsoUtcDate(value);

        if (!isIsoUtcDate) {
          invalidType({ label, type });
        }

        const minDate = new Date("1000/01/01");
        const maxDate = new Date("9999/12/31");

        if (checkDate <= minDate) {
          throw new ErrorMessage({
            statusCode: "400 BAD REQUEST",
            message: `A informação ${label} deve ser maior que 01/01/1000`,
          });
        }

        if (checkDate >= maxDate) {
          throw new ErrorMessage({
            statusCode: "400 BAD REQUEST",
            message: `A informação ${label} deve ser menor que 31/12/9999`,
          });
        }

        break;
      }

      case "json":
        try {
          JSON.parse(String(value));
        } catch (_error) {
          invalidType({ label, type });
        }
        break;

      case "array":
        if (!Array.isArray(value)) {
          invalidType({ label, type });
        }

        if (required && !value.length) {
          throw new ErrorMessage({
            statusCode: "400 BAD REQUEST",
            message: `A informação ${label} requer pelo menos um valor.`,
          });
        }
        break;

      case "time":
        checkString({ label, value });

        if (!invalidTime(value)) {
          invalidType({ label, type });
        }
        break;

      case "email":
        {
          checkString({ label, value });

          const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

          if (!emailRegex.test(value)) {
            throw new ErrorMessage({
              statusCode: "400 BAD REQUEST",
              message: `O ${label} deve possuir o formato email@example.com`,
            });
          }
        }
        break;

      case "CEP":
        {
          checkString({ label, value });

          const CEPRegex = /^\d{8}$|^\d{5}-\d{3}$/;

          if (!CEPRegex.test(value)) {
            throw new ErrorMessage({
              statusCode: "400 BAD REQUEST",
              message: `O ${label} deve possuir o formato 00000-000`,
            });
          }
        }
        break;

      case "CPF":
        {
          checkString({ label, value });

          const CPFRegex = /^(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2})$/;

          if (!CPFRegex.test(value)) {
            throw new ErrorMessage({
              statusCode: "400 BAD REQUEST",
              message: `O ${label} deve possuir o formato 000.000.000-00`,
            });
          }
        }
        break;

      case "CNPJ":
        {
          checkString({ label, value });

          const CNPJRegex = /^(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})$/;

          if (!CNPJRegex.test(value)) {
            throw new ErrorMessage({
              statusCode: "400 BAD REQUEST",
              message: `O ${label} deve possuir o formato 00.000.000/0000-00`,
            });
          }
        }
        break;

      case "stringForUrl":
        {
          checkString({ label, value });

          const urlStringRegex = /^[a-zA-ZÀ-ÖØ-öø-ÿ0-9~\s\\[\]]+$/;

          if (!urlStringRegex.test(value)) {
            throw new ErrorMessage({
              statusCode: "400 BAD REQUEST",
              message: `A informação ${label} não deve possuir caracteres especiais.`,
            });
          }
        }
        break;

      case "username":
        {
          checkString({ label, value });

          const usernameRegex = /^(?=.{3,20}$)(?![_.])(?!.*[_.]{2})[a-zA-Z0-9._]+(?<![_.])$/;

          if (!usernameRegex.test(value)) {
            throw new ErrorMessage({
              statusCode: "400 BAD REQUEST",
              message: `A informação ${label} não deve possuir caracteres especiais e deve conter de 3 a 20 caracteres`,
            });
          }
        }
        break;

      case "stringNumbers":
        {
          checkString({ label, value });

          const stringNumbersRegex = /^\d+$/;

          if (!stringNumbersRegex.test(value)) {
            invalidType({ label, type });
          }
        }
        break;

      case "phone":
        {
          checkString({ label, value });

          const phoneRegex = /^(\([0-9]{2}\) ?|[0-9]{2} ?)?(?:[0-9]{4,5}-?[0-9]{4})$/;

          if (!phoneRegex.test(value)) {
            throw new ErrorMessage({
              statusCode: "400 BAD REQUEST",
              message: `O ${label} deve possuir o formato (00) 0000-0000 ou (00) 90000-0000`,
            });
          }
        }
        break;

      default:
        break;
    }
  }
}

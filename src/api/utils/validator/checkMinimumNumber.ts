import { ErrorMessage } from '../error';

interface ICheckMinimumNumber {
  value: number;
  min: number;
  label: string;
}

export function checkMinimumNumber(vars: ICheckMinimumNumber[]) {
  for (let i = 0; i < vars.length; i++) {
    if (vars[i].value !== null && vars[i].value !== undefined && vars[i].value < vars[i].min) {
      throw new ErrorMessage({
        statusCode: '400 BAD REQUEST',
        message: `A informação ${vars[i].label} deve ser maior ou igual a ${vars[i].min}.`,
      });
    }
  }
}

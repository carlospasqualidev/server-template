import { ErrorMessage } from '../error';

export function checkNaN(NumberList: { number: any; label: string }[]) {
  for (const { number, label } of NumberList) {
    if (number && Number.isNaN(Number(number))) {
      throw new ErrorMessage({
        statusCode: '400 BAD REQUEST',
        message: `A informação ${label} foi enviada de maneira incorreta.`,
      });
    }
  }
}

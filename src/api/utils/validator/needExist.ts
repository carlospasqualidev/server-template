import { ErrorMessage } from '../error/errorMessage';
import { INeedAndCannotExist } from './types';

export function needExist(vars: INeedAndCannotExist[]) {
  for (let i = 0; i < vars.length; i++) {
    if (!vars[i].variable) {
      throw new ErrorMessage({
        statusCode: '404 NOT FOUND',
        message: `A informação ${vars[i].label} não existe na base de dados.`,
      });
    }
  }
}

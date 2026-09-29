import { ErrorMessage } from '../error/errorMessage';
import { INeedAndCannotExist } from './types';

export function cannotExist(vars: INeedAndCannotExist[]) {
  for (let i = 0; i < vars.length; i++) {
    if (vars[i].variable) {
      throw new ErrorMessage({
        statusCode: '400 BAD REQUEST',
        message: `A informação ${vars[i].label} já existe na base de dados.`,
      });
    }
  }
}

import { IToken } from '../../../types/token';
import { generateToken } from '../../utils/token';

export function generateAuthTokenService(data: IToken) {
  return generateToken(data);
}

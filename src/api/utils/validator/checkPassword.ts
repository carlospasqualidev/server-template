import { ErrorMessage } from '../error';

export function checkPassword({
  password,
  confirmPassword,
}: {
  password?: string | null;
  confirmPassword?: string | null;
}) {
  const passwordMinLength = 8;

  if (!password && !confirmPassword) return;

  if ((password && !confirmPassword) || (!password && confirmPassword)) {
    throw new ErrorMessage({
      message: 'Envie a senha e a confirmação da senha.',
      statusCode: '400 BAD REQUEST',
    });
  }

  if (password !== confirmPassword) {
    throw new ErrorMessage({
      message: 'As senhas precisam ser iguais',
      statusCode: '400 BAD REQUEST',
    });
  }

  if (password && password.length < passwordMinLength) {
    throw new ErrorMessage({
      message: `A senha precisa ter pelo menos ${passwordMinLength} dígitos`,
      statusCode: '400 BAD REQUEST',
    });
  }
}

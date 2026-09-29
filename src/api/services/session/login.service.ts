import { compare } from "bcrypt";
import { ErrorMessage } from "../../utils/error";
import { findUserByEmailForLoginService } from "../user/findUserByEmailForLogin.service";

export async function loginService(email: string, password: string) {
  const user = await findUserByEmailForLoginService(email.toLowerCase());

  const validPassword = await compare(password, user?.password || "");

  if (!user || !validPassword) {
    throw new ErrorMessage({
      statusCode: "400 BAD REQUEST",
      message: "Credenciais inválidas.",
    });
  }

  if (!user.isActive) {
    throw new ErrorMessage({
      statusCode: "403 FORBIDDEN",
      message: "Sua conta está bloqueada.",
    });
  }

  return user;
}

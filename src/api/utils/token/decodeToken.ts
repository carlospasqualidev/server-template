import jwt from "jsonwebtoken";
import { ErrorMessage } from "../error/errorMessage";

export function decodeToken(token: string) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!);
  } catch (_error) {
    throw new ErrorMessage({
      statusCode: "400 BAD REQUEST",
      message: "Token inválido.",
    });
  }
}

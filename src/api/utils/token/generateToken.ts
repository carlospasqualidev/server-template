import jwt from "jsonwebtoken";

export function generateToken(data: any) {
  const secret: any = process.env.JWT_SECRET;

  return jwt.sign(data, secret, { expiresIn: "8h" });
}

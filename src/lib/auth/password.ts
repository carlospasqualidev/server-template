import bcrypt from "bcrypt";

import { env } from "@/config/env";

// Custo baixo em teste para a suíte não gastar segundos gerando hash.
const BCRYPT_ROUNDS = env.isTest ? 4 : 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

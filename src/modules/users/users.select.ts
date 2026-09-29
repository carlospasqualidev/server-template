import { type Prisma } from "@/generated/prisma/client";

/** Colunas devolvidas pelo CRUD. Espelha `userSchema`; `password` nunca sai daqui. */
export const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/** Colunas devolvidas na sessão (login, register, /me). Espelha `userSummarySchema`. */
export const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} satisfies Prisma.UserSelect;

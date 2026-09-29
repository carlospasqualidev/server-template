import { afterAll, beforeEach } from "vitest";

import { prisma } from "@/lib/prisma";

/** Cada teste começa com o banco vazio. Tabelas novas precisam entrar nesta lista. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "companies" RESTART IDENTITY CASCADE');
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

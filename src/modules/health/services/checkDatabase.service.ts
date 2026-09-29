import { prisma } from "@/lib/prisma";

export async function checkDatabaseService(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return true;
  } catch {
    return false;
  }
}

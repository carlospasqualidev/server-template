import { prisma } from "../lib/prisma";
import { upsertDefaultUsers } from "./seeds/upsertDefaultUsers";
import { upsertGenders } from "./seeds/upsertGenders";

async function main() {
  await upsertGenders();
  await upsertDefaultUsers();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

import { maleGenderID, femaleGenderID } from "../../src/config/constants";
import { prisma } from "../../lib/prisma";

export async function upsertGenders() {
  const genders = [
    { id: maleGenderID, name: "Masculino" },
    { id: femaleGenderID, name: "Feminino" },
  ];

  for (const gender of genders) {
    await prisma.gender.upsert({
      where: { id: gender.id },
      update: {},
      create: { id: gender.id, name: gender.name },
    });
  }

  console.info("Genders upserted");
}

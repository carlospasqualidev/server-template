import { prisma } from "../../lib/prisma";
import { hashSync } from "bcrypt";
import { defaultCompanyImage } from "../../src/api/utils/misc/defaultCompanyImage";
import { defaultUserImage } from "../../src/api/utils/misc/defaultUserImage";
import { maleGenderID } from "../../src/config/constants.ts";

export async function upsertDefaultUsers() {
  const users = Array.from({ length: 26 }, (_, i) => i + 1);

  const defaultUser = await prisma.user.upsert({
    create: {
      email: "admin@admin.com",
      image: defaultUserImage,
      name: "Admin",
      password: hashSync("123123123", 12),
      username: "admin",
      company: { create: { image: defaultCompanyImage, name: "Admin Company" } },
    },
    update: {},
    where: {
      email: "admin@admin.com",
    },
  });

  const userUpserts = users.map((number: number) => {
    const letter = String.fromCharCode(64 + number);
    const email = `user${letter}@user.com`.toLowerCase();
    const username = `user${letter}`.toLowerCase();

    return prisma.user.upsert({
      create: {
        email,
        username,
        image: defaultUserImage,
        name: `user${letter}`,
        password: hashSync("123123123", 12),
        companyId: defaultUser.companyId,
        isActive: number % 2 === 0,
      },
      update: {},
      where: { email },
    });
  });

  await Promise.all([
    ...userUpserts,

    prisma.person.upsert({
      create: {
        id: "000000000001",
        displayName: "João da Silva",
        companyId: defaultUser.companyId,
        natural: {
          create: {
            fullName: "João da Silva",
            cpf: "12345678910",
            birthDate: new Date("1990-01-01"),
            genderId: maleGenderID,
          },
        },
        observation: "Cliente desde 2023",
        addresses: {
          create: [
            {
              cep: "88000000",
              street: "Rua A",
              number: "123",
              neighborhood: "Centro",
              city: "Florianópolis",
              state: "SC",
              complement: "Apto 1",
            },
          ],
        },
        phones: { create: [{ phone: "48999999999" }] },
        emails: { create: [{ email: "joao.silva@example.com" }] },
      },
      update: {},
      where: { id: "000000000001" },
    }),

    prisma.person.upsert({
      create: {
        id: "11111111112",
        displayName: "Empresa XYZ",
        companyId: defaultUser.companyId,
        legal: {
          create: {
            cnpj: "12345678000190",
            legalName: "Empresa XYZ LTDA",
            tradeName: "Empresa XYZ",
          },
        },
        observation: "Cliente desde 2023",
        addresses: {
          create: [
            {
              cep: "88000000",
              street: "Rua B",
              number: "456",
              neighborhood: "Centro",
              city: "Florianópolis",
              state: "SC",
              complement: "Sala 2",
            },
          ],
        },
        phones: { create: [{ phone: "48888888888" }] },
        emails: { create: [{ email: "contato@empresaxyz.com" }] },
      },
      update: {},
      where: { id: "11111111112" },
    }),
  ]);

  console.info("Default User created.");
}

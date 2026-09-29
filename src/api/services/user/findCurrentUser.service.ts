import { prisma } from "../../../../lib/prisma";
import { needExist } from "../../utils/validator";

// ESSA FUNÇÃO É SÓ PRA SALVAR OS DADOS NO CONTEXTO/ZUSTAND DO CLIENT
export async function findCurrentUserService(id: string) {
  const user = await prisma.user.findUnique({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      username: true,
    },
    where: {
      id,
      deletedAt: null,
    },
  });

  needExist([{ label: "Usuário", variable: user }]);

  return user!;
}

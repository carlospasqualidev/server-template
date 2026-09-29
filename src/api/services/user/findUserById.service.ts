import { prisma } from "../../../../lib/prisma";
import { needExist } from "../../utils/validator";

export async function findUserByIdService({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
      username: true,
    },
    where: {
      id: userId,
      deletedAt: null,
    },
  });

  needExist([{ label: "Usuário", variable: user }]);

  return user!;
}

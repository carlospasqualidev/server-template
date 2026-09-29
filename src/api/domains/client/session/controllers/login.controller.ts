import { FastifyReply, FastifyRequest } from "fastify";
import { checkValues } from "../../../../utils/validator";
import { loginService } from "../../../../services/session/login.service";
import { generateAuthTokenService } from "../../../../services/user/generateAuthToken.service";

type LoginRequest = FastifyRequest<{
  Body: {
    email: string;
    password: string;
  };
}>;

export async function loginController(req: LoginRequest, reply: FastifyReply) {
  const { email, password } = req.body;

  checkValues([
    { label: "Email", type: "email", value: email },
    { label: "Senha", type: "string", value: password },
  ]);

  const user = await loginService(email, password);

  const token = generateAuthTokenService({
    user: { id: user.id },
  });

  reply.setCookie("token", token, {
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  });

  const userToReturn = {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };

  return reply.status(200).send({ success: true, user: userToReturn });
}

import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { LOGIN_RATE_LIMIT } from "@/config/constants";
import { loginController } from "@/modules/session/controllers/login.controller";
import { logoutController } from "@/modules/session/controllers/logout.controller";
import { registerController } from "@/modules/session/controllers/register.controller";
import { loginRouteSchema } from "@/modules/session/schemas/login.schema";
import { logoutRouteSchema } from "@/modules/session/schemas/logout.schema";
import { registerRouteSchema } from "@/modules/session/schemas/register.schema";

export interface SessionRoutesOptions {
  /** Sobrescreve o limite de tentativas de login (usado pelos testes). */
  loginRateLimitMax?: number;
}

export const sessionRoutes: FastifyPluginAsyncZod<SessionRoutesOptions> = async (app, options) => {
  const loginRateLimit = { max: options.loginRateLimitMax ?? LOGIN_RATE_LIMIT.max, timeWindow: LOGIN_RATE_LIMIT.timeWindow };

  app.post("/login", { schema: loginRouteSchema, config: { rateLimit: loginRateLimit } }, loginController);
  app.post("/register", { schema: registerRouteSchema, config: { rateLimit: loginRateLimit } }, registerController);
  app.post("/logout", { schema: logoutRouteSchema }, logoutController);
};

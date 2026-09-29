import "fastify";

import type { AuthenticatedUser } from "@/lib/auth/authenticatedUser";

declare module "fastify" {
  interface FastifyRequest {
    /** Preenchido pelo hook `requireSession`. `null` em rotas públicas. */
    user: AuthenticatedUser | null;
  }
}

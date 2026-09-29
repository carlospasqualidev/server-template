import "fastify";
import type { AuthenticatedUser } from "./authenticatedUser";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

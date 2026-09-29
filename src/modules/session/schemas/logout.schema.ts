import { z } from "zod";

export const logoutResponseSchema = z.object({
  success: z.literal(true),
});

export const logoutRouteSchema = {
  tags: ["Session"],
  summary: "Encerra a sessão atual",
  description: "Remove o cookie de sessão do cliente.",
  response: { 200: logoutResponseSchema },
};

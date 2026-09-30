import { z } from "zod";

export const logoutResponseSchema = z.object({
  success: z.literal(true),
});

export const logoutRouteSchema = {
  tags: ["Session"],
  summary: "Encerra a sessão atual",
  description:
    "Remove o cookie de sessão do cliente. O JWT é sem estado e não é revogado: o app nativo, que usa `Authorization: Bearer`, descarta o token guardado; o token vale até expirar.",
  response: { 200: logoutResponseSchema },
};

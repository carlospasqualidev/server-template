import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number().describe("Segundos desde que o processo subiu."),
});

export const getHealthRouteSchema = {
  tags: ["Health"],
  summary: "Liveness: o processo está no ar",
  response: { 200: healthResponseSchema },
};

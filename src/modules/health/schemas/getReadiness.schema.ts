import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";

export const readinessResponseSchema = z.object({
  status: z.literal("ok"),
  database: z.literal("ok"),
});

export const getReadinessRouteSchema = {
  tags: ["Health"],
  summary: "Readiness: o processo está no ar e o banco responde",
  response: { 200: readinessResponseSchema, 503: errorResponseSchema },
};

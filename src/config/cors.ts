import { type FastifyCorsOptions } from "@fastify/cors";

import { env } from "@/config/env";

export const corsOptions: FastifyCorsOptions = {
  origin: env.corsOrigins,
  credentials: true,
};

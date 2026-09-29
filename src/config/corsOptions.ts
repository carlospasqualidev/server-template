import { FastifyCorsOptions } from "@fastify/cors";

const origin = ["http://localhost:5173", "http://localhost:4173"];

export const corsOptions: FastifyCorsOptions = {
  origin,
  credentials: true,
};

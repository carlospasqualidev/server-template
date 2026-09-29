import { FastifyPluginAsync } from "fastify";
import { uploadManyController } from "./controllers/uploadMany.controller";
import { uploadManyRouteSchema } from "./schemas/uploadMany.schema";

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/files",
    {
      schema: uploadManyRouteSchema,
      // O Swagger precisa do schema.body para renderizar o input de arquivo,
      // mas o Fastify não valida multipart como um body JSON comum.
      validatorCompiler: () => (data) => ({ value: data }),
    },
    uploadManyController,
  );
};

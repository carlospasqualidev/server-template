import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { uploadFileController } from "@/modules/upload/controllers/uploadFile.controller";
import { uploadFileRouteSchema } from "@/modules/upload/schemas/uploadFile.schema";

export const uploadRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/file",
    {
      schema: uploadFileRouteSchema,
      // O Swagger precisa de `schema.body` para renderizar o input de arquivo, mas multipart é lido como stream
      // pelo controller, não validado como JSON. Este compilador aceita qualquer body só nesta rota.
      validatorCompiler: () => (data) => ({ value: data }),
    },
    uploadFileController,
  );
};

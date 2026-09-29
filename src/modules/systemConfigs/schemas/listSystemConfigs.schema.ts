import { z } from "zod";

import { errorResponseSchema } from "@/lib/http/responses";
import { systemConfigListSchema } from "@/modules/systemConfigs/schemas/systemConfig.schemas";

export const listSystemConfigsResponseSchema = z.object({
  systemConfigs: systemConfigListSchema,
});

export const listSystemConfigsRouteSchema = {
  tags: ["SystemConfigs"],
  summary: "Lista as configurações de sistema da empresa",
  description:
    "Exige `backoffice.systemConfigs.read`. Devolve o catálogo inteiro, na ordem da tela, com o valor da empresa (o gravado ou o padrão). Lista finita, vinda do código: sem paginação e sem `count`.",
  security: [{ cookieAuth: [] }],
  response: {
    200: listSystemConfigsResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
  },
};

import { z } from "zod";

import { MOBILE_CLIENT_TYPE } from "@/config/constants";

/**
 * Cabeçalhos do login e do register. `X-Client-Type: mobile` identifica o app nativo, que recebe o token da sessão no
 * corpo em vez do cookie. É o único valor aceito: outro responde 400, para um erro de digitação no app não virar, em
 * silêncio, uma sessão de web sem token.
 */
export const sessionClientHeadersSchema = z.object({
  "x-client-type": z
    .enum([MOBILE_CLIENT_TYPE], { message: `O cabeçalho X-Client-Type aceita apenas o valor "${MOBILE_CLIENT_TYPE}".` })
    .optional()
    .describe(
      "Envie `mobile` no app nativo: o token da sessão vem no corpo (`token`) e o cookie não é gravado. A web não envia.",
    ),
});

export type SessionClientHeaders = z.infer<typeof sessionClientHeadersSchema>;

export const sessionTokenSchema = z
  .string()
  .optional()
  .describe(
    "JWT da sessão, só com o cabeçalho `X-Client-Type: mobile`. O app o guarda no armazenamento seguro e o envia em `Authorization: Bearer <token>`. Vale até `SESSION_TTL_HOURS`, sem renovação.",
  );

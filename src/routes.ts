import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { requireSession } from "@/hooks/requireSession";
import { auditRoutes } from "@/modules/audit/audit.routes";
import { rolesRoutes } from "@/modules/roles/roles.routes";
import { type SessionRoutesOptions, sessionRoutes } from "@/modules/session/session.routes";
import { systemConfigsRoutes } from "@/modules/systemConfigs/systemConfigs.routes";
import { uploadRoutes } from "@/modules/upload/upload.routes";
import { type UsersRoutesOptions, usersRoutes } from "@/modules/users/users.routes";

export type ApiRoutesOptions = SessionRoutesOptions & UsersRoutesOptions;

/**
 * Árvore de rotas da API (`/api`). O grupo `/client` é o consumidor atual (frontend web).
 * Um novo consumidor (ex.: `/backoffice`) entra como outro grupo aqui, reaproveitando os módulos.
 *
 * Atenção: o Fastify inclui `prefix` nas opções recebidas pelo plugin. Repasse opções campo a campo,
 * nunca com spread, para não sobrescrever o prefixo dos filhos.
 */
export const apiRoutes: FastifyPluginAsyncZod<ApiRoutesOptions> = async (app, options) => {
  app.register(clientRoutes, { prefix: "/client", loginRateLimitMax: options.loginRateLimitMax });
};

const clientRoutes: FastifyPluginAsyncZod<ApiRoutesOptions> = async (app, options) => {
  app.register(sessionRoutes, { prefix: "/session", loginRateLimitMax: options.loginRateLimitMax });

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("onRequest", requireSession);

    protectedRoutes.register(usersRoutes, { prefix: "/users", loginRateLimitMax: options.loginRateLimitMax });
    protectedRoutes.register(rolesRoutes, { prefix: "/roles" });
    protectedRoutes.register(systemConfigsRoutes, { prefix: "/system-configs" });
    protectedRoutes.register(auditRoutes, { prefix: "/audit-logs" });
    protectedRoutes.register(uploadRoutes, { prefix: "/upload" });
  });
};

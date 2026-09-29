import { buildApp } from "@/app";
import { env } from "@/config/env";
import { swaggerUiOptions } from "@/config/swagger";
import { syncPermissionCatalogService } from "@/modules/permissions/services/syncPermissionCatalog.service";

const app = buildApp();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info(`${signal} recebido, encerrando...`);

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Falha ao encerrar");
    process.exit(1);
  }
}

/**
 * Leva o catálogo de permissões do código ao banco antes de aceitar requisição: a versão que sobe já encontra as
 * permissões que as rotas dela exigem. Depende do schema atualizado, por isso o `prisma migrate deploy` roda antes.
 * Instâncias subindo juntas se serializam pela trava do próprio service.
 */
async function syncPermissionCatalog(): Promise<void> {
  try {
    const { created, updated, removed } = await syncPermissionCatalogService();
    app.log.info({ created, updated, removed }, "Catálogo de permissões sincronizado");
  } catch (error) {
    throw new Error("Falha ao sincronizar o catálogo de permissões (as migrations foram aplicadas?)", {
      cause: error,
    });
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  await syncPermissionCatalog();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Documentação em http://localhost:${env.PORT}${swaggerUiOptions.routePrefix}`);
} catch (error) {
  app.log.error(error, "Falha ao subir o servidor");
  process.exit(1);
}

import { type App, buildApp, type BuildAppOptions } from "@/app";

/** Instância pronta para `inject()`. Feche com `await app.close()` no `afterAll`. */
export async function createTestApp(options?: BuildAppOptions): Promise<App> {
  const app = buildApp(options);
  await app.ready();

  return app;
}

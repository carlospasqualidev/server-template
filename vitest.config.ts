import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

import { testEnv, UNIT_TEST_DATABASE_URL } from "./src/tests/testEnv.js";

/** Teste que não toca banco: projeto `unit`. Todo o resto de `src/tests/` é do projeto `integration`. */
const UNIT_TEST_FILES = "src/tests/**/*.unit.test.ts";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    env: testEnv,
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 60_000,
    // `vitest run --changed` (`npm run test:related`) roda tudo quando muda um destes. O `setupFiles` de um projeto não
    // entra sozinho na lista (só o da raiz), e os arquivos da raiz de `src/tests/` são a infraestrutura da suíte.
    // Schema e migrations não estão no grafo de imports: sem eles aqui, mudança só de banco rodaria 0 testes.
    forceRerunTriggers: [
      ...configDefaults.forceRerunTriggers,
      "**/src/tests/*.ts",
      "**/prisma/schema.prisma",
      "**/prisma/migrations/**",
    ],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [UNIT_TEST_FILES],
          // Sem banco: nem banco temporário nem reset, e os arquivos rodam em paralelo. A URL aponta para uma porta
          // fechada: teste unit que consultar o banco falha na hora, em vez de passar por acaso.
          env: { DATABASE_URL: UNIT_TEST_DATABASE_URL },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, UNIT_TEST_FILES],
          globalSetup: ["./src/tests/globalSetup.ts"],
          setupFiles: ["./src/tests/setup.ts"],
          // Um banco temporário por execução, compartilhado pelos arquivos: eles rodam em sequência para não interferirem.
          fileParallelism: false,
        },
      },
    ],
  },
});

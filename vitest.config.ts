import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { testEnv } from "./src/tests/testEnv.js";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    globalSetup: ["./src/tests/globalSetup.ts"],
    setupFiles: ["./src/tests/setup.ts"],
    // Um único banco de teste: os arquivos rodam em sequência para não interferirem entre si.
    fileParallelism: false,
    env: testEnv,
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});

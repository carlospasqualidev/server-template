// @ts-check

import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

const RELATIVE_IMPORT_MESSAGE = "Importe pelo alias `@/` (ex.: `@/lib/errors`), nunca por caminho relativo.";

export default defineConfig(
  // src/api, lib e prisma/seeds sao a estrutura antiga. Apague-as e remova daqui.
  globalIgnores(["dist/**", "coverage/**", "src/generated/**", "docs/**", "src/api/**", "lib/**", "prisma/seeds/**"]),
  eslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  security.configs.recommended,
  {
    plugins: { "import-x": importX },
    rules: {
      "arrow-body-style": ["error", "as-needed"],
      "no-console": "error",
      "no-unreachable": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": "error",
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"], "type"],
          pathGroups: [{ pattern: "@/**", group: "internal" }],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      // Todo import interno usa o alias `@/`. Caminho relativo quebra o build (tsc-alias) e esconde a camada de origem.
      "no-restricted-imports": ["error", { patterns: [{ group: ["./*", "../*"], message: RELATIVE_IMPORT_MESSAGE }] }],
      // Variavel de ambiente so e lida em src/config/env.ts, validada com Zod.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name=process][property.name=env]",
          message: "Leia variáveis de ambiente por `env` de `@/config/env`, nunca por `process.env`.",
        },
      ],
    },
  },
  {
    // Camadas: controller, rota, schema e hook nunca falam com o banco. Acesso ao Prisma e exclusivo dos services.
    files: ["src/modules/**/controllers/**", "src/modules/**/schemas/**", "src/modules/**/*.routes.ts", "src/hooks/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["./*", "../*"], message: RELATIVE_IMPORT_MESSAGE },
            { group: ["@/lib/prisma"], message: "Acesso ao banco só em `services/`. Chame um service." },
          ],
        },
      ],
    },
  },
  {
    // lib e config sao infraestrutura compartilhada: nao conhecem modulos de negocio.
    files: ["src/lib/**", "src/config/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["./*", "../*"], message: RELATIVE_IMPORT_MESSAGE },
            { group: ["@/modules/*"], message: "`lib` e `config` não importam de `modules`." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/config/env.ts", "src/tests/**", "prisma/**", "scripts/**", "prisma.config.ts", "vitest.config.ts"],
    rules: {
      "no-restricted-syntax": "off",
      "no-console": "off",
    },
  },
  {
    files: ["vitest.config.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  prettier,
);

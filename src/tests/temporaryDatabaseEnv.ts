import { inject } from "vitest";

import { assertTemporaryDatabase, databaseNameOf } from "@/tests/testDatabase";

/**
 * Aponta o worker para o banco temporário criado pelo `globalSetup`. Precisa ser o primeiro import do `setup.ts`:
 * `@/config/env` lê `DATABASE_URL` ao ser carregado, e o client do Prisma conecta com ela.
 */
const databaseUrl = inject("testDatabaseUrl");
assertTemporaryDatabase(databaseNameOf(databaseUrl));

process.env.DATABASE_URL = databaseUrl;

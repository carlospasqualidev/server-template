import { describe, expect, it } from "vitest";

import {
  assertTemporaryDatabase,
  databaseNameOf,
  DEFAULT_TEST_SERVER_URL,
  isOrphanTemporaryDatabase,
  resolveTestServer,
  temporaryDatabaseCreatedAt,
  temporaryDatabaseName,
  withDatabaseName,
} from "@/tests/testDatabase";

const RDS_URL = "postgresql://admin:secret@app-prod.abc123.us-east-1.rds.amazonaws.com:5432/app";
const LOCAL_REFUSAL = "A suíte só roda em Postgres local";

describe("resolveTestServer", () => {
  it.each([
    "postgresql://postgres:postgres@localhost:5433/server_template",
    "postgresql://postgres:postgres@127.0.0.1:5432/x",
    "postgresql://postgres:postgres@[::1]:5432/x",
    "postgresql://postgres:postgres@LOCALHOST:5432/x",
  ])("aceita host local em TEST_DATABASE_URL (%s)", (testDatabaseUrl) => {
    expect(resolveTestServer({ testDatabaseUrl, dotenvDatabaseUrl: RDS_URL })).toEqual({
      serverUrl: testDatabaseUrl,
      warning: null,
    });
  });

  it("recusa host de RDS vindo de TEST_DATABASE_URL, mesmo com o .env local", () => {
    expect(() =>
      resolveTestServer({
        testDatabaseUrl: RDS_URL,
        dotenvDatabaseUrl: "postgresql://postgres:postgres@localhost:5433/server_template",
      }),
    ).toThrow(
      `${LOCAL_REFUSAL} (localhost, 127.0.0.1, ::1); host recebido: "app-prod.abc123.us-east-1.rds.amazonaws.com"`,
    );
  });

  it.each([
    "postgresql://postgres:postgres@localhost:5432/x?host=app-prod.abc123.us-east-1.rds.amazonaws.com",
    "postgresql://postgres:postgres@localhost:5432/x?hostaddr=10.0.0.1",
    "postgresql://postgres:postgres@postgres:5432/x",
    "nao-e-url",
  ])(
    "recusa TEST_DATABASE_URL que pode sair da máquina (serviço do compose, ?host=, ?hostaddr=) ou inválida (%s)",
    (testDatabaseUrl) => {
      expect(() => resolveTestServer({ testDatabaseUrl })).toThrow(LOCAL_REFUSAL);
    },
  );

  it("usa o servidor do .env quando ele é local", () => {
    const dotenvDatabaseUrl = "postgresql://postgres:postgres@localhost:5433/server_template_local";

    expect(resolveTestServer({ dotenvDatabaseUrl })).toEqual({ serverUrl: dotenvDatabaseUrl, warning: null });
  });

  it("ignora o .env remoto e cai no Postgres local padrão, com aviso de uma linha", () => {
    const { serverUrl, warning } = resolveTestServer({ dotenvDatabaseUrl: RDS_URL });

    expect(serverUrl).toBe(DEFAULT_TEST_SERVER_URL);
    expect(warning).toBe(
      'DATABASE_URL do .env ignorado (host "app-prod.abc123.us-east-1.rds.amazonaws.com" não é local); usando postgresql://localhost:5432/postgres.',
    );
    expect(warning).not.toContain("\n");
    expect(warning).not.toContain("secret");
  });

  it("sem TEST_DATABASE_URL nem .env, usa o Postgres padrão do compose", () => {
    expect(resolveTestServer({})).toEqual({
      serverUrl: "postgresql://postgres:postgres@localhost:5432/postgres",
      warning: null,
    });
  });
});

describe("banco temporário", () => {
  const now = new Date("2026-10-02T14:05:09.123Z");

  it("gera o nome com prefixo, carimbo UTC e sufixo aleatório, em minúsculas", () => {
    expect(temporaryDatabaseName(now, "A1B2C3D4")).toBe("temporary-int-20261002140509-a1b2c3d4");
  });

  it("lê o carimbo do nome e devolve null para nome fora do formato", () => {
    expect(temporaryDatabaseCreatedAt("temporary-int-20261002140509-a1b2c3d4")).toEqual(
      new Date("2026-10-02T14:05:09.000Z"),
    );
    expect(temporaryDatabaseCreatedAt("temporary-int-manual")).toBeNull();
    expect(temporaryDatabaseCreatedAt("server_template_test")).toBeNull();
  });

  it("só considera órfão o temporário com mais de 6 h; recentes e nomes fora do formato ficam", () => {
    expect(isOrphanTemporaryDatabase("temporary-int-20261002080509-aa", now)).toBe(true);
    expect(isOrphanTemporaryDatabase("temporary-int-20261002090509-aa", now)).toBe(false);
    expect(isOrphanTemporaryDatabase("temporary-int-20261002140000-aa", now)).toBe(false);
    expect(isOrphanTemporaryDatabase("temporary-int-qualquer", now)).toBe(false);
    expect(isOrphanTemporaryDatabase("server_template", now)).toBe(false);
  });

  it("troca só o nome do banco na URL", () => {
    const url = withDatabaseName(
      "postgresql://postgres:postgres@localhost:5433/server_template?sslmode=disable",
      "temporary-int-20261002140509-a1",
    );

    expect(url).toBe("postgresql://postgres:postgres@localhost:5433/temporary-int-20261002140509-a1?sslmode=disable");
    expect(databaseNameOf(url)).toBe("temporary-int-20261002140509-a1");
  });

  it("trava o reset e o DROP fora do prefixo temporary-int-", () => {
    expect(() => assertTemporaryDatabase("temporary-int-20261002140509-a1")).not.toThrow();
    expect(() => assertTemporaryDatabase("server_template_test")).toThrow(
      'Banco de teste precisa começar com "temporary-int-" (recebido: "server_template_test").',
    );
  });
});

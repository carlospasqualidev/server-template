/**
 * Banco da suíte: só Postgres local, um banco temporário por execução (`temporary-int-<carimbo>-<aleatório>`).
 * Funções puras; quem conecta, cria e apaga é o `globalSetup`.
 */

/** Prefixo dos bancos temporários. TRUNCATE e DROP só rodam em banco com este prefixo. */
export const TEMPORARY_DATABASE_PREFIX = "temporary-int-";

/** Banco temporário mais velho que isto é órfão (execução morta sem teardown) e é apagado no início da próxima. */
export const ORPHAN_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Postgres padrão do `docker-compose.yml` e do `.env.example`, no banco de manutenção. */
export const DEFAULT_TEST_SERVER_URL = "postgresql://postgres:postgres@localhost:5432/postgres";

/**
 * Hosts aceitos: só a própria máquina. O nome do serviço do compose (`postgres`) fica de fora: a suíte roda no host,
 * não na rede do compose, e ali o nome pode resolver (por search domain) para um servidor remoto.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Parâmetros de query que o driver `pg` usa no lugar do host da URL. */
const HOST_OVERRIDE_PARAMS = ["host", "hostaddr"];

const TEMPORARY_DATABASE_PATTERN = /^temporary-int-([0-9]{14})-[0-9a-f]+$/;

function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

/** `true` só para URL válida cujo host (e eventual `?host=`/`?hostaddr=`) é local. */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  let url: URL;

  try {
    url = new URL(databaseUrl);
  } catch {
    return false;
  }

  if (HOST_OVERRIDE_PARAMS.some((param) => url.searchParams.has(param))) {
    return false;
  }

  return LOCAL_HOSTS.has(hostOf(url));
}

function describeHost(databaseUrl: string): string {
  try {
    return hostOf(new URL(databaseUrl)) || "(vazio)";
  } catch {
    return "(URL inválida)";
  }
}

export interface TestServerSources {
  /** `TEST_DATABASE_URL` do shell (CI ou outro Postgres local). */
  testDatabaseUrl?: string | undefined;
  /** `DATABASE_URL` do arquivo `.env`. */
  dotenvDatabaseUrl?: string | undefined;
}

export interface TestServer {
  /** Servidor e credenciais; o nome do banco é trocado pelo temporário. */
  serverUrl: string;
  /** Aviso de uma linha quando o `.env` foi ignorado. */
  warning: string | null;
}

/**
 * Servidor de teste, nesta ordem: `TEST_DATABASE_URL`, o `DATABASE_URL` do `.env` (se local) ou o Postgres padrão.
 * A URL final é recusada se o host não for local, venha de onde vier. Sem flag de escape: a suíte cria e apaga
 * bancos e trunca tabelas.
 */
export function resolveTestServer(sources: TestServerSources): TestServer {
  let serverUrl = DEFAULT_TEST_SERVER_URL;
  let warning: string | null = null;

  if (sources.testDatabaseUrl) {
    serverUrl = sources.testDatabaseUrl;
  } else if (sources.dotenvDatabaseUrl) {
    if (isLocalDatabaseUrl(sources.dotenvDatabaseUrl)) {
      serverUrl = sources.dotenvDatabaseUrl;
    } else {
      warning = `DATABASE_URL do .env ignorado (host "${describeHost(sources.dotenvDatabaseUrl)}" não é local); usando ${DEFAULT_TEST_SERVER_URL.replace(/\/\/[^@]*@/, "//")}.`;
    }
  }

  if (!isLocalDatabaseUrl(serverUrl)) {
    throw new Error(
      `A suíte só roda em Postgres local (${[...LOCAL_HOSTS].join(", ")}); host recebido: "${describeHost(serverUrl)}". Ajuste TEST_DATABASE_URL.`,
    );
  }

  return { serverUrl, warning };
}

/** Mesma URL apontando para outro banco. */
export function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(databaseName)}`;

  return url.toString();
}

export function databaseNameOf(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
}

/** `temporary-int-AAAAMMDDhhmmss-<aleatório>`, carimbo em UTC. */
export function temporaryDatabaseName(now: Date, randomSuffix: string): string {
  const stamp = now
    .toISOString()
    .slice(0, 19)
    .replace(/[^0-9]/g, "");

  return `${TEMPORARY_DATABASE_PREFIX}${stamp}-${randomSuffix.toLowerCase()}`;
}

/** Instante de criação lido do nome, ou `null` se o nome não segue o formato. */
export function temporaryDatabaseCreatedAt(databaseName: string): Date | null {
  const stamp = TEMPORARY_DATABASE_PATTERN.exec(databaseName)?.[1];

  if (!stamp) {
    return null;
  }

  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`;
  const createdAt = new Date(iso);

  return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

/** Órfão: nome no formato e carimbo mais velho que `ORPHAN_MAX_AGE_MS`. Os recentes podem ser de outra execução. */
export function isOrphanTemporaryDatabase(databaseName: string, now: Date): boolean {
  const createdAt = temporaryDatabaseCreatedAt(databaseName);

  return createdAt !== null && now.getTime() - createdAt.getTime() > ORPHAN_MAX_AGE_MS;
}

/** Trava antes de TRUNCATE e DROP. */
export function assertTemporaryDatabase(databaseName: string): void {
  if (!databaseName.startsWith(TEMPORARY_DATABASE_PREFIX)) {
    throw new Error(
      `Banco de teste precisa começar com "${TEMPORARY_DATABASE_PREFIX}" (recebido: "${databaseName}"). A suíte trunca tabelas e apaga o banco.`,
    );
  }
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

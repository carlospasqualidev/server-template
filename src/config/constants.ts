/** Nome do cookie HTTP-only que carrega o JWT da sessão. */
export const SESSION_COOKIE_NAME = "token";

export const PASSWORD_MIN_LENGTH = 8;

/** Paginação padrão das listagens (alinhada à DataTable do frontend). */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/**
 * Máximo de ids numa lista do corpo (`permissionIds`, `roleIds`, `userIds`). A consulta por essa lista
 * (`id: { in: [...] }`) fica limitada por este valor, validado no schema da rota.
 */
export const MAX_BODY_IDS = 1000;

export const MAX_UPLOAD_FILE_SIZE_IN_BYTES = 15 * 1024 * 1024;

/**
 * Faixa aceita para o tempo de inatividade até o logout, em minutos: no cadastro do usuário (`idleTimeoutMinutes`) e na
 * configuração da empresa (`security.idleTimeoutMinutes`). O padrão, quando nenhum dos dois está definido, fica no
 * catálogo de configurações.
 */
export const IDLE_TIMEOUT_MINUTES_RANGE = { min: 1, max: 480 } as const;

/** Tamanho máximo do texto de um valor de configuração de sistema (qualquer tipo). */
export const MAX_SYSTEM_CONFIG_VALUE_LENGTH = 10_000;

/** Tamanho máximo do `User-Agent` gravado na trilha de auditoria: o cabeçalho vem do cliente e não tem limite próprio. */
export const AUDIT_USER_AGENT_MAX_LENGTH = 512;

/**
 * Retenção da trilha de auditoria: eventos por comando de anonimização ou de exclusão (e empresas por página). Lote
 * pequeno mantém cada comando curto; o laço repete até não sobrar evento vencido.
 */
export const AUDIT_RETENTION_BATCH_SIZE = 500;

/** Horário fixo, em UTC, da execução diária da retenção agendada pelo `server.ts` (03:00 UTC = meia-noite em Brasília). */
export const AUDIT_RETENTION_DAILY_RUN_UTC = { hour: 3, minute: 0 } as const;

/**
 * Tempo de trabalho de uma execução da retenção. Passado ele, a execução para no intervalo entre dois lotes e devolve o
 * que fez, marcada como interrompida (`interrupted: "timeLimit"`); a seguinte continua de onde esta parou.
 */
export const AUDIT_RETENTION_TIME_LIMIT_MS = 55 * 60 * 1000;

/**
 * Folga da transação que segura a trava da retenção além do tempo de trabalho (o `timeout` dela é a soma): cobre o lote
 * em curso quando o tempo vence, que leva milissegundos. O Prisma encerra a transação que passa do `timeout`, e com
 * ela solta a trava; com a folga, a execução para antes disso.
 */
export const AUDIT_RETENTION_LOCK_MARGIN_MS = 5 * 60 * 1000;

/**
 * Espera máxima, no encerramento do servidor, pela execução da retenção em curso, que para no fim do lote atual
 * (milissegundos). Fica abaixo dos 10 s que o `docker stop` dá, por padrão, entre o SIGTERM e o SIGKILL.
 */
export const AUDIT_RETENTION_SHUTDOWN_WAIT_MS = 5_000;

/** Limite de tentativas de login por IP. */
export const LOGIN_RATE_LIMIT = { max: 10, timeWindow: "1 minute" } as const;

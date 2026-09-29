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

/** Limite de tentativas de login por IP. */
export const LOGIN_RATE_LIMIT = { max: 10, timeWindow: "1 minute" } as const;

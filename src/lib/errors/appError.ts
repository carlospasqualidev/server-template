interface AppErrorOptions {
  statusCode: number;
  message: string;
  /** Dado extra devolvido ao cliente junto com `message` (ex.: lista de campos). Nunca inclua stack ou PII. */
  details?: unknown;
  cause?: unknown;
}

/**
 * Erro esperado, com status HTTP e mensagem em pt-BR pronta para o usuário final.
 * O `errorHandler` responde `{ message, details? }` com o status informado. Tudo que não é `AppError` vira 500.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor({ statusCode, message, details, cause }: AppErrorOptions) {
    super(message, { cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Requisição inválida.", details?: unknown) {
    super({ statusCode: 400, message, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autenticado.") {
    super({ statusCode: 401, message });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado.") {
    super({ statusCode: 403, message });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Registro não encontrado.") {
    super({ statusCode: 404, message });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Registro já existe.") {
    super({ statusCode: 409, message });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Serviço indisponível no momento.") {
    super({ statusCode: 503, message });
  }
}

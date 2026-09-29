import { ConflictError, NotFoundError } from "@/lib/errors/appError";

/**
 * Garante que um registro buscado existe e estreita o tipo (remove `null | undefined`).
 *
 * @example
 * const user = await prisma.user.findFirst({ where: { id, companyId, deletedAt: null } });
 * assertExists(user, "Usuário");
 * user.name; // tipado, sem non-null assertion
 */
export function assertExists<T>(value: T | null | undefined, label: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(`${label} não existe na base de dados.`);
  }
}

/** Garante que um registro NÃO existe (ex.: e-mail já cadastrado). Responde 409. */
export function assertNotExists(value: unknown, label: string): void {
  if (value !== null && value !== undefined) {
    throw new ConflictError(`${label} já existe na base de dados.`);
  }
}

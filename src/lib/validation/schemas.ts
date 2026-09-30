import { z } from "zod";

import { MAX_IMAGE_URL_LENGTH, PASSWORD_MIN_LENGTH } from "@/config/constants";

/** Primitivos reutilizáveis com mensagem em pt-BR. Componha-os nos schemas dos módulos. */

export const idSchema = z.uuid({ message: "Identificador inválido." });

export const emailSchema = z
  .string({ message: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .max(254, "O e-mail deve ter no máximo 254 caracteres.")
  .pipe(z.email({ message: "O e-mail deve possuir o formato email@example.com." }))
  .meta({ format: "email" });

export const passwordSchema = z
  .string({ message: "Informe a senha." })
  .min(PASSWORD_MIN_LENGTH, `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(72, "A senha deve ter no máximo 72 caracteres.");

export const nameSchema = z
  .string({ message: "Informe o nome." })
  .trim()
  .min(2, "O nome precisa ter pelo menos 2 caracteres.")
  .max(120, "O nome deve ter no máximo 120 caracteres.");

/** Telefone brasileiro com ou sem máscara: `(48) 99999-9999`, `48 3333-4444`, `48999999999`. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\(?\d{2}\)? ?\d{4,5}-?\d{4}$/, "O telefone deve possuir o formato (00) 0000-0000 ou (00) 90000-0000.");

export const cpfSchema = z
  .string()
  .trim()
  .regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, "O CPF deve possuir o formato 000.000.000-00.");

export const cnpjSchema = z
  .string()
  .trim()
  .regex(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, "O CNPJ deve possuir o formato 00.000.000/0000-00.");

export const cepSchema = z
  .string()
  .trim()
  .regex(/^\d{5}-?\d{3}$/, "O CEP deve possuir o formato 00000-000.");

export const urlSchema = z.url({ message: "URL inválida." });

/**
 * URL de imagem gravada numa entidade (a foto do usuário, o `Location` do upload). Só `https:`: `urlSchema` aceita
 * também `javascript:`, `data:` e `http:`, que o cliente renderizaria. O tamanho é conferido antes da análise da URL.
 */
export const imageUrlSchema = z
  .string({ message: "A imagem deve ser uma URL https válida." })
  .max(MAX_IMAGE_URL_LENGTH, `A URL da imagem deve ter no máximo ${MAX_IMAGE_URL_LENGTH} caracteres.`)
  .pipe(z.url({ protocol: /^https$/, message: "A imagem deve ser uma URL https válida." }))
  .meta({ format: "uri" });

/** Data sem hora, `AAAA-MM-DD`. */
export const dateOnlySchema = z.iso.date({ message: "Data inválida. Use o formato AAAA-MM-DD." });

/** Data e hora ISO 8601 em UTC, `2026-03-31T00:00:00.000Z`. */
export const dateTimeSchema = z.iso.datetime({ message: "Data e hora inválidas. Use ISO 8601 em UTC." });

interface PasswordConfirmation {
  password?: string | undefined;
  confirmPassword?: string | undefined;
}

/** Regra de confirmação de senha, para `.refine()` em qualquer body com `password` + `confirmPassword`. */
export function passwordsMatch(data: PasswordConfirmation): boolean {
  return data.password === undefined || data.password === data.confirmPassword;
}

export const passwordsMatchIssue = { message: "As senhas precisam ser iguais.", path: ["confirmPassword"] };

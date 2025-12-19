export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
const err = (error: string): ValidationResult<never> => ({ ok: false, error });

export const parseEmail = (
  input: unknown,
  field = "Email",
): ValidationResult<string> => {
  if (typeof input !== "string") return err(`${field} is required.`);
  const value = input.trim().toLowerCase();
  if (!value || !value.includes("@")) return err(`${field} is invalid.`);
  return ok(value);
};

export const parseString = (
  input: unknown,
  field: string,
  options?: { minLength?: number },
): ValidationResult<string> => {
  if (typeof input !== "string") return err(`${field} is required.`);
  const value = input.trim();
  if (options?.minLength && value.length < options.minLength) {
    return err(`${field} must be at least ${options.minLength} characters.`);
  }
  return ok(value);
};

export const parsePositiveInt = (
  input: unknown,
  field: string,
  fallback?: number,
): ValidationResult<number> => {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback !== undefined
      ? ok(fallback)
      : err(`${field} must be a number.`);
  }
  const floored = Math.floor(parsed);
  if (floored <= 0) {
    return fallback !== undefined
      ? ok(fallback)
      : err(`${field} must be greater than zero.`);
  }
  return ok(floored);
};

export const collectErrors = (results: ValidationResult<unknown>[]) =>
  results.flatMap((result) => (result.ok ? [] : [result.error]));

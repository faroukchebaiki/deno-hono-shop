export const parseEmail = (input: unknown, field = "Email") => {
  if (typeof input !== "string") return `${field} is required.`;
  const value = input.trim().toLowerCase();
  if (!value || !value.includes("@")) return `${field} is invalid.`;
  return value;
};

export const parseString = (
  input: unknown,
  field: string,
  options?: { minLength?: number },
) => {
  if (typeof input !== "string") return `${field} is required.`;
  const value = input.trim();
  if (options?.minLength && value.length < options.minLength) {
    return `${field} must be at least ${options.minLength} characters.`;
  }
  return value;
};

export const parsePositiveInt = (
  input: unknown,
  field: string,
  fallback?: number,
) => {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback ?? `${field} must be a number.`;
  }
  const floored = Math.floor(parsed);
  if (floored <= 0) {
    return fallback ?? `${field} must be greater than zero.`;
  }
  return floored;
};

export const collectErrors = (values: (string | number)[]) =>
  values.filter((v) => typeof v === "string") as string[];

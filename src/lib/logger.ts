export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  if (error && typeof error === "object") {
    const data = error as Record<string, unknown>;
    return {
      name: typeof data.name === "string" ? data.name : "Error",
      message: typeof data.message === "string" ? data.message : String(error),
      code: data.code,
    };
  }
  return { message: String(error) };
};

const log = (level: LogLevel, message: string, context?: LogContext) => {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...context,
  };
  const output = JSON.stringify(payload);
  if (level === "error") {
    console.error(output);
    return;
  }
  if (level === "warn") {
    console.warn(output);
    return;
  }
  console.log(output);
};

export const logInfo = (message: string, context?: LogContext) =>
  log("info", message, context);

export const logWarn = (message: string, context?: LogContext) =>
  log("warn", message, context);

export const logError = (
  message: string,
  error?: unknown,
  context?: LogContext,
) =>
  log("error", message, {
    ...context,
    ...(error ? { error: serializeError(error) } : {}),
  });

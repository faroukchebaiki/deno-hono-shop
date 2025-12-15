import type { MiddlewareHandler } from "hono";

export type AuthSession = {
  userId: string;
  issuedAt: number;
};

export type AuthCookieConfig = {
  name: string;
  secret: string;
  maxAgeSeconds: number;
  secure: boolean;
};

const fallbackSecret = "replace-me";

export const getAuthCookieConfig = (): AuthCookieConfig => ({
  name: "session",
  secret: Deno.env.get("COOKIE_SECRET") ?? fallbackSecret,
  maxAgeSeconds: 60 * 60 * 24 * 7,
  secure: true
});

// Placeholder for stateless signed cookie auth.
// This middleware currently just passes through and should be replaced with
// actual verification + session handling when business logic is added.
export const authMiddleware: MiddlewareHandler = async (_c, next) => {
  await next();
};

// Placeholder helpers for future stateless authentication flows.
export const issueAuthCookie = (_session: AuthSession) => {
  const { name } = getAuthCookieConfig();
  return { name, value: "", attributes: {} };
};

export const clearAuthCookie = () => {
  const { name } = getAuthCookieConfig();
  return { name, value: "", attributes: { expires: new Date(0) } };
};

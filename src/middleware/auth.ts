import type { MiddlewareHandler } from "hono";
import { loadConfig } from "../config/env.ts";

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

export const getAuthCookieConfig = (): AuthCookieConfig => {
  const { auth, server } = loadConfig();
  const isProdLike = server.environment === "production" ||
    Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));

  return {
    name: "session",
    secret: auth.cookieSecret,
    maxAgeSeconds: 60 * 60 * 24 * 7,
    secure: isProdLike
  };
};

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

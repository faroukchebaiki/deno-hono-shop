import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { randomToken } from "../lib/crypto.ts";
import { isProdLike } from "./config.ts";

const CSRF_COOKIE = "csrf_token";

export const ensureCsrfToken = (c: Context): string => {
  const existing = getCookie(c, CSRF_COOKIE);
  if (existing) return existing;
  const token = randomToken(24);
  setCookie(c, CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "Lax",
    secure: isProdLike(),
    path: "/",
    maxAge: 60 * 60 * 2, // 2 hours
  });
  return token;
};

export const validateCsrf = (c: Context, provided?: string): boolean => {
  const cookieToken = getCookie(c, CSRF_COOKIE);
  if (!cookieToken || !provided) return false;
  return cookieToken === provided;
};

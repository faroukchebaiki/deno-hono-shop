import type { MiddlewareHandler } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import type { Role } from "../types/domain.ts";
import { getAuthCookieConfig } from "../auth/config.ts";
import { createSessionToken, verifySessionToken } from "../auth/session.ts";
import { userRepository } from "../db/repositories.ts";

export type AuthUser = {
  id: string;
  role: Role;
  email?: string;
};

export type AuthCookieConfig = {
  name: string;
  cookieSecret: string;
  maxAgeSeconds: number;
  secure: boolean;
};

const cookieAttributes = (secure: boolean, maxAgeSeconds?: number) => ({
  httpOnly: true,
  sameSite: "Lax" as const,
  secure,
  path: "/",
  maxAge: maxAgeSeconds,
});

export const issueAuthCookie = async (userId: string, role: Role) => {
  const { name, secure, maxAgeSeconds } = getAuthCookieConfig();
  const value = await createSessionToken(userId, role, maxAgeSeconds);
  return { name, value, attributes: cookieAttributes(secure, maxAgeSeconds) };
};

export const clearAuthCookie = () => {
  const { name, secure } = getAuthCookieConfig();
  return {
    name,
    value: "",
    attributes: { ...cookieAttributes(secure), expires: new Date(0) },
  };
};

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const { name, secure } = getAuthCookieConfig();
  const token = getCookie(c, name);
  if (!token) return await next();

  try {
    const payload = await verifySessionToken(token);
    if (!payload) {
      deleteCookie(c, name, { path: "/", secure, sameSite: "Lax" });
      return await next();
    }

    const user = await userRepository.findActiveById(payload.sub);
    if (!user) {
      deleteCookie(c, name, { path: "/", secure, sameSite: "Lax" });
      return await next();
    }

    const authUser: AuthUser = {
      id: user.id,
      role: user.role,
      email: user.email ?? undefined,
    };
    c.set("user", authUser);
  } catch (error) {
    console.error("Auth middleware failed to resolve session:", error);
  }

  return await next();
};

export const requireUser = (): MiddlewareHandler => async (c, next) => {
  const user = c.get("user") as AuthUser | undefined;
  if (!user) {
    const returnTo = encodeURIComponent(c.req.path || "/");
    return c.redirect(`/auth/login?returnTo=${returnTo}`);
  }
  return await next();
};

export const requireRole =
  (roles: Role[]): MiddlewareHandler => async (c, next) => {
    const user = c.get("user") as AuthUser | undefined;
    if (!user) {
      const returnTo = encodeURIComponent(c.req.path || "/");
      return c.redirect(`/auth/login?returnTo=${returnTo}`);
    }
    if (!roles.includes(user.role)) {
      return c.text("Forbidden", 403);
    }
    return await next();
  };

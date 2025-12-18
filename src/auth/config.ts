import { loadConfig } from "../config/env.ts";

export const isProdLike = () => {
  const { server } = loadConfig();
  return server.environment === "production" ||
    Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));
};

export const getAuthCookieConfig = () => {
  const { auth } = loadConfig();
  return {
    name: "session",
    cookieSecret: auth.cookieSecret,
    maxAgeSeconds: 60 * 60 * 24 * 7,
    secure: isProdLike(),
  };
};

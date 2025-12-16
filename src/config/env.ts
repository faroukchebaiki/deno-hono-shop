export type ServerConfig = {
  port: number;
  environment: string;
};

export type DatabaseConfig = {
  url: string;
};

export type StripeConfig = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
};

export type AuthConfig = {
  cookieSecret: string;
};

export type AppConfig = {
  server: ServerConfig;
  database: DatabaseConfig;
  stripe: StripeConfig;
  auth: AuthConfig;
};

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const requireEnv = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const loadConfig = (): AppConfig => ({
  server: {
    port: numberFromEnv(Deno.env.get("PORT"), 8000),
    environment: Deno.env.get("APP_ENV") ?? "development"
  },
  database: {
    url: requireEnv("DATABASE_URL")
  },
  stripe: {
    secretKey: Deno.env.get("STRIPE_SECRET_KEY") ?? "",
    publishableKey: Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "",
    webhookSecret: Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? ""
  },
  auth: {
    cookieSecret: requireEnv("COOKIE_SECRET")
  }
});

import type { StripeConfig } from "./env.ts";
import { loadConfig } from "./env.ts";

export const getStripeConfig = (): StripeConfig => loadConfig().stripe;

// Placeholder factory for creating a Stripe client when business logic is added.
export const createStripeClient = () => {
  const config = getStripeConfig();
  return { ...config, client: null };
};

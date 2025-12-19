# deno-hono-shop

Minimal scaffold for a Deno + Hono e-commerce app with SSR, Tailwind/daisyUI,
Neon Postgres, and Stripe placeholders. Tooling uses pnpm for Tailwind.

## Quick start

1. Install deps: `pnpm install` (Node + pnpm required).
2. Copy `.env.example` to `.env` and fill values.
3. Init DB schema: `deno task db:init` and optionally seed demo catalog
   `deno task db:seed`.
4. Build CSS: `deno task dev:css` (pnpm-powered) or one-off
   `deno task build:css`.
5. Run the server: `deno task dev` then visit `http://localhost:8000`.
6. Stripe (for checkout): set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and
   `STRIPE_WEBHOOK_SECRET`; point your webhook to
   `http://localhost:8000/webhooks/stripe` (Stripe CLI recommended).

## Tooling

- Runtime: Deno with Hono (SSR via JSX renderer)
- Styling: Tailwind CSS + daisyUI (see `tailwind.config.ts`)
- Data: Neon Postgres client (serverless-friendly)
- Auth: placeholder stateless signed-cookie middleware
  (`src/middleware/auth.ts`)
- Payments: Stripe config scaffold (`src/config/stripe.ts`)
- Deploy: `deno task deploy` (requires `deployctl`)

## Development tasks

- `deno task dev` — run server with env loading + watch
- `deno task dev:css` — watch Tailwind build to `static/styles.css` (uses
  `pnpm exec tailwindcss`)
- `deno task build:css` — one-off CSS build (uses `pnpm exec tailwindcss`)
- `deno task db:init` — apply minimal schema in `scripts/db/schema.sql`
- `deno task db:seed` — seed demo products
- `deno task warmup` — simulate deploy warmup locally
- `deno task smoke` — warmup + seed + cart/checkout dry-run (no Stripe call)
- `deno task test` — run unit tests
- `deno task fmt` / `deno task lint`

Or use pnpm scripts directly: `pnpm run tailwind:dev`,
`pnpm run tailwind:build`.

## Deploy notes

See `DEPLOYMENT.md` for recommended deploy settings (install `pnpm install`,
build `pnpm run tailwind:build`, entrypoint `src/main.tsx`, and required env
vars). `deno.json` deploy include ships `package.json` and `pnpm-lock.yaml` so
the install step can run in CI/deploy.

For Deno Deploy, ensure `DATABASE_URL` is set (Neon serverless connection
string).

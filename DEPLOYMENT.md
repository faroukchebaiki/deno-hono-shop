# Deployment configuration

This project is designed for Deno Deploy or any platform that can run Deno. To
avoid editing settings in a dashboard, configure your deploy target as follows:

- Framework preset: **No preset**
- Install command: `pnpm install` (requires `package.json`/`pnpm-lock.yaml`;
  both are shipped via `deno.json` deploy include)
- Build command: `pnpm run tailwind:build` (generates `static/styles.css`)
- Pre-deploy command: _leave blank_ (no migrations/models yet)
- Entrypoint: `src/main.tsx`
- Arguments: _leave blank_
- Runtime working directory: _repo root_

Database schema:

- Apply `scripts/db/schema.sql` to your Neon/Postgres database before using
  auth/catalog routes.
- Locally: run `deno task db:init` (and optionally `deno task db:seed`).

Environment variables required at runtime:

- `APP_ENV` (e.g., `production`)
- `PORT` (e.g., `8000` or leave for platform default)
- `DATABASE_URL` (Neon/Postgres connection string)
- `COOKIE_SECRET` (strong random string)
- `DEPLOY_PROJECT` (optional; defaults to `deno-hono-shop`)

Stripe keys are not required until payments are implemented; add them later if
you integrate Stripe.

Stripe webhook endpoint:

- Use `https://<your-domain>/webhooks/stripe` (or
  `http://localhost:8000/webhooks/stripe` with Stripe CLI) and set the
  `STRIPE_WEBHOOK_SECRET` from the configured endpoint.

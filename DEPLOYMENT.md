# Deployment configuration

This project is designed for Deno Deploy or any platform that can run Deno. To avoid editing settings in a dashboard, configure your deploy target as follows:

- Framework preset: **No preset**
- Install command: `pnpm install` (requires `package.json`/`pnpm-lock.yaml`; both are shipped via `deno.json` deploy include)
- Build command: `pnpm run tailwind:build` (generates `static/styles.css`)
- Pre-deploy command: _leave blank_ (no migrations/models yet)
- Entrypoint: `src/main.tsx`
- Arguments: _leave blank_
- Runtime working directory: _repo root_

Environment variables required at runtime:

- `APP_ENV` (e.g., `production`)
- `PORT` (e.g., `8000` or leave for platform default)
- `DATABASE_URL` (Postgres connection string)
- `COOKIE_SECRET` (strong random string)
- `DEPLOY_PROJECT` (optional; defaults to `deno-hono-shop`)

Stripe keys are not required until payments are implemented; add them later if you integrate Stripe.

For Deno Deploy with Prisma Accelerate, also set:

- `PRISMA_ACCELERATE_URL` (Accelerate connection URL for your database)
- `PRISMA_CLIENT_ENGINE_TYPE=dataproxy`

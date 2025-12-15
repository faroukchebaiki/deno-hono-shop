# deno-hono-shop

Minimal scaffold for a Deno + Hono e-commerce app with SSR, Tailwind/daisyUI, Prisma (Postgres), and Stripe placeholders. Tooling uses pnpm for Tailwind/Prisma.

## Quick start

1) Install deps: `pnpm install` (Node + pnpm required).  
2) Copy `.env.example` to `.env` and fill values.  
3) Build CSS: `deno task dev:css` (pnpm-powered) or one-off `deno task build:css`.  
4) Run the server: `deno task dev` then visit `http://localhost:8000`.

## Tooling

- Runtime: Deno with Hono (SSR via JSX renderer)
- Styling: Tailwind CSS + daisyUI (see `tailwind.config.ts`)
- Data: Prisma with Postgres datasource (`prisma/schema.prisma`)
- Auth: placeholder stateless signed-cookie middleware (`src/middleware/auth.ts`)
- Payments: Stripe config scaffold (`src/config/stripe.ts`)
- Deploy: `deno task deploy` (requires `deployctl`)

## Development tasks

- `deno task dev` — run server with env loading + watch
- `deno task dev:css` — watch Tailwind build to `static/styles.css` (uses `pnpm exec tailwindcss`)
- `deno task build:css` — one-off CSS build (uses `pnpm exec tailwindcss`)
- `deno task prisma:generate` — generate Prisma client after adding models (uses `pnpm exec prisma`)
- `deno task fmt` / `deno task lint`

Or use pnpm scripts directly: `pnpm run tailwind:dev`, `pnpm run tailwind:build`, `pnpm run prisma:generate`.

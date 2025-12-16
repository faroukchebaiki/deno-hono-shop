# Project Plan — Deno Hono Commerce

Intent: ship a production-ready, SSR-only e-commerce experience on Deno Deploy using Hono, Tailwind, daisyUI, Prisma/Postgres, signed-cookie auth, and Stripe Checkout. Keep it minimal, edge-friendly, and easy to extend.

## Stage 0 — Foundations (✅ done)
- [x] Ensure tasks: `deno task dev`, `deno task dev:css`, `deno task build:css`, `deno task prisma:generate`, `deno task lint`, `deno task fmt`.
- [x] Env validation: fail fast on missing `DATABASE_URL`, `COOKIE_SECRET`; keep Stripe optional until payments.
- [x] Base layout: SSR renderer, static middleware, hero/home scaffold, shared styles.
- [x] Repo hygiene: `.env.example`, `.gitignore`, deploy include list, README/DEPLOYMENT notes.

## Stage 1 — Domain & Schema (✅ done)
- [x] Model in Prisma: User, Role, Product, ProductVariant, Inventory, Cart, CartItem, Order, OrderItem, Address, Payment (Stripe), WebhookEvent.
- [x] Add enums: OrderStatus (pending, paid, shipped, refunded, cancelled), Role (customer, staff, admin), plus CartStatus/PaymentStatus.
- [x] Run `deno task prisma:generate`; add seed script for products/admin user (hash placeholder until auth).
- [x] Add minimal repository helpers (pure functions) for products and orders; keep DB access thin.

## Stage 2 — Auth (stateless cookies)
- Define cookie payload: `sub`, `role`, `exp`, `iat`, `nonce`.
- Sign/verify with HMAC (crypto.subtle) using `COOKIE_SECRET`; rotate via key version field if needed.
- Middleware: parse + verify cookie, attach `c.set("user", …)`, short-circuit unauthorized.
- Routes: login, register (hash passwords with bcrypt), logout; forms SSR.
- Guards: `requireUser`, `requireRole(["admin","staff"])` for `/account/*` and `/admin/*`.
- CSRF: double-submit token for POST forms; ensure `SameSite=Lax`, `HttpOnly`, `Secure` toggled by environment.

## Stage 3 — Catalog & Public Pages
- Public routes: Home, Products list (paginate + filter by category), Product detail, About, Contact, Terms, Privacy.
- Components: product cards, filters, pagination, breadcrumbs, header/footer partials.
- Data: fetch from Prisma; add basic seed images/data; format money centrally.
- SEO: per-page title/description, canonical links, basic Open Graph/Twitter tags.

## Stage 4 — Cart & Checkout (Stripe)
- Cart stored server-side in DB keyed to user or signed cart cookie for guests; merge on login.
- Cart pages: view/edit quantities, remove lines, show totals, shipping/tax placeholders.
- Checkout flow:
  - Create Order (status `pending`) + line items from cart.
  - Create Stripe Checkout Session server-side; store `stripeSessionId`, `orderId`.
  - Redirect to Stripe-hosted checkout; no card data handled locally.
  - Success/cancel pages show order summary and next steps.
- Webhooks: verify signature, update order status `pending -> paid`, capture payment intent id, append webhook event record; ignore client-initiated status.

## Stage 5 — Account Area
- Dashboard summary (recent orders, profile snippet).
- Order history list + order detail (lines, totals, status timeline).
- Profile management: name, email, password change (requires current password).
- Address book: shipping/billing addresses CRUD.
- Ensure guards and SSR-only forms with POST/redirect-after-post pattern.

## Stage 6 — Admin & Staff
- Admin login (reuses auth).
- Product management: list, create, update, archive, variants, inventory adjustments.
- Order management: filter by status, view detail, update status to shipped/refunded/cancelled (server-side rules, log actor + timestamp).
- User management: roles, deactivate/reactivate accounts.
- Staff role: restricted to order view/update-shipping only.
- Audit log: minimal table capturing action, user, target, timestamp.

## Stage 7 — Observability & Operations
- Health endpoint (`/health`) already present; extend to include DB connectivity check.
- Structured logging (app-level helper) with request id; log auth errors and webhook handling.
- Metrics hooks (simple counters/timers) with a pluggable reporter (noop by default).
- Error handling: global error boundary to render friendly pages; 404 page.

## Stage 8 — Security & Compliance
- Harden cookies: `HttpOnly`, `SameSite=Lax`, `Secure` in prod; short lifetimes; refresh tokens pattern optional.
- Input validation: zod-like validation for forms/params; server-side only.
- Rate limiting (lightweight, in-memory for now) on auth routes and webhook endpoint.
- Stripe webhook secret check mandatory; reject unsigned or stale timestamps.
- Content Security Policy tuned for self + Stripe assets; set core security headers.

## Stage 9 — Deployment & DX
- Deploy target: Deno Deploy via `deno task deploy` entrypoint `src/main.tsx`.
- Build pipeline: `pnpm install`, `deno task build:css`, `deno task lint`, `deno task fmt --check`, `deno task prisma:generate` (read-only client build).
- Env checklist for prod: `APP_ENV`, `PORT` (optional), `DATABASE_URL`, `COOKIE_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `DEPLOY_PROJECT`.
- Local tooling: Postgres, Stripe CLI for webhook forwarding; docs for running `stripe listen` and mapping to `/webhooks/stripe`.

## Stage 10 — Nice-to-haves (after core)
- Search/sort enhancements with precomputed facets.
- Image handling: aspect-ratio helpers and placeholders; optional CDN base URL.
- Email notifications: order confirmation using a provider (abstracted service).
- Accessibility pass: focus order, skip links, aria labels on forms/nav.
- Performance: HTTP caching for public assets, ETag/304 on pages where safe.

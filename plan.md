# Project Plan — Deno Hono Commerce (Refreshed)

Current state (done):

- SSR public pages (home, products list/detail, about/contact/terms/privacy).
- Neon/Postgres with products/orders/users; seed + demo users/products.
- Auth (stateless cookies), CSRF, rate limiting, security headers/CSP.
- Cart + Stripe Checkout + webhook, order creation/updates.
- Account dashboard with orders; admin/staff orders table + status updates;
  admin products list (read-only).
- Warmup script, health with metrics/optional DB check, basic logging.

## Stage 0 — Baseline & Quality (✅ mostly done)

- [x] Tasks: dev, css, db:init/seed, warmup, lint, fmt; deploy settings
      documented.
- [x] Env: requires DATABASE_URL, COOKIE_SECRET, Stripe keys.
- [x] Add minimal input validation helpers (forms/params) and reuse across
      routes (auth forms now validated).

## Stage 1 — Customer Profile & Addresses

- Profile: update name/email/password (with current-password check).
- Address book: add/edit/delete shipping & billing addresses; mark defaults.
- Use validation helpers; show success/error states; SSR forms only.

## Stage 2 — Catalog Admin CRUD

- Admin product create/update/archive; manage price, category, images array.
- Optional inventory fields (stock, SKU); simple image URL inputs.
- Admin product detail/edit forms; server-side validation; flash messages.

## Stage 3 — Orders & Fulfillment Details

- Persist line items for orders (reflect cart at checkout time).
- Order detail (admin/customer) shows items, quantities, totals, status history.
- Add shipped/refunded transitions with timestamps/actor logging (audit-lite).

## Stage 4 — User Management & Audit Log

- Admin: list users, change roles (customer/staff/admin), activate/deactivate.
- Audit log table capturing actor, action, target, timestamp; render admin view.

## Stage 5 — Observability Upgrades

- Structured logging helper with request id; log auth errors, webhook events.
- Metrics counters/timers with a pluggable sink (no-op default); expose in
  health.
- Error boundary page + friendly 500 responses.

## Stage 6 — Security Hardening

- Input validation everywhere (finish Stage 0 item).
- Rate limit tuning + per-IP bucket for auth/webhooks; add captcha hook if
  needed.
- Security headers review (CSP nonce for inline styles/buttons if required).
- Strict cookie lifetimes/rotation for auth; logout everywhere helper.

## Stage 7 — DX & Testing

- Add minimal unit/integration tests (e.g., handlers, validation).
- Scripted local e2e smoke (warmup + DB seed + checkout dry-run without Stripe
  call).
- Keep docs aligned (README/DEPLOYMENT) with new flows/envs.

## Stage 8 — Nice-to-haves

- Image CDN/base URL support; skeleton loaders for products.
- Search/sort enhancements (price, category chips).
- Email notifications (order confirmation) behind a provider-agnostic interface.
- Performance: HTTP caching for public assets, ETag/304 where safe.

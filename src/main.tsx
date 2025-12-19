import { Hono } from "hono";
import type { Context } from "hono";
import type { Child } from "hono/jsx";
import { jsxRenderer, serveStatic } from "hono/middleware";
import { loadConfig } from "./config/env.ts";
import { authMiddleware, requireRole, requireUser } from "./middleware/auth.ts";
import { authRoutes } from "./routes/auth.tsx";
import { OrderStatus, Role } from "./types/domain.ts";
import {
  addressRepository,
  auditLogRepository,
  cartRepository,
  orderItemRepository,
  orderRepository,
  productRepository,
  userRepository,
} from "./db/repositories.ts";
import { getCookie, setCookie } from "hono/cookie";
import type { AuthUser } from "./middleware/auth.ts";
import {
  collectErrors,
  parseEmail,
  parseMoneyCents,
  parseOptionalInt,
  parseString,
} from "./lib/validation.ts";
import { hashPassword, verifyPassword } from "./lib/crypto.ts";
import { ensureCsrfToken, validateCsrf } from "./auth/csrf.ts";
import { logError, logInfo, logWarn } from "./lib/logger.ts";
import {
  createInMemoryMetrics,
  getMetricsSnapshot,
  recordRequest,
  setMetricsSink,
} from "./lib/metrics.ts";
import Stripe from "stripe";

const startTime = Date.now();
const { server, stripe: stripeConfig } = loadConfig();
const app = new Hono();
const isProdLike = server.environment === "production" ||
  Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));
const cartCookieName = "cart_session";
const metricsSink = createInMemoryMetrics();
setMetricsSink(metricsSink);
const rateLimitBuckets = new Map<string, { resetAt: number; count: number }>();

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  image: string;
  badge?: string;
  tags?: string[];
  rating?: number;
};

const products: Product[] = [
  {
    id: "carryall-tote",
    name: "Carryall Tote",
    category: "Bags",
    price: 72,
    description: "Waxed canvas with leather trim and interior laptop sleeve.",
    image:
      "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1200&q=80",
    badge: "New",
    tags: ["Water-resistant", '13" laptop'],
    rating: 4.8,
  },
  {
    id: "everyday-sneaker",
    name: "Everyday Sneaker",
    category: "Footwear",
    price: 98,
    description: "Low-profile silhouette with recycled rubber sole.",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
    badge: "Bestseller",
    tags: ["Unisex", "Breathable"],
    rating: 4.7,
  },
  {
    id: "linen-shirt",
    name: "Linen Camp Shirt",
    category: "Apparel",
    price: 64,
    description: "Airy linen blend with a relaxed drape for warmer days.",
    image:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80",
    tags: ["Relaxed fit", "Machine-washable"],
    rating: 4.6,
  },
  {
    id: "stoneware-set",
    name: "Stoneware Dinner Set",
    category: "Home",
    price: 120,
    description: "Matte-glazed 12-piece set crafted for daily use.",
    image:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    badge: "Restocked",
    tags: ["Dishwasher safe", "Scratch resistant"],
    rating: 4.9,
  },
  {
    id: "desk-lamp",
    name: "Arc Desk Lamp",
    category: "Workspace",
    price: 88,
    description: "Adjustable arm with warm LED and weighted steel base.",
    image:
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80",
    tags: ["LED", "Dimmable"],
    rating: 4.5,
  },
  {
    id: "weekender",
    name: "Weekender Duffel",
    category: "Travel",
    price: 138,
    description: "Carry-on sized with shoe garage and interior organization.",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    badge: "Limited",
    tags: ["Carry-on", "Removable strap"],
    rating: 4.7,
  },
];

const categories = [
  "Bags",
  "Footwear",
  "Apparel",
  "Travel",
  "Workspace",
  "Home",
];

type LayoutProps = {
  children?: Child;
  title?: string;
  description?: string;
};

const Layout = ({
  children,
  title = "Hono Shop",
  description =
    "A minimal, SSR-only e-commerce starter built with Deno + Hono.",
}: LayoutProps) => (
  <html data-theme="light">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
      <link rel="stylesheet" href="/static/styles.css" />
    </head>
    <body class="min-h-screen bg-base-200 text-base-content">
      {children}
    </body>
  </html>
);

app.use("/static/*", serveStatic({ root: "./" }));

app.use(
  "*",
  jsxRenderer(Layout),
);

app.use("*", async (c, next) => {
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  c.header("Content-Security-Policy", cspDirectives);
  await next();
});

app.use("*", async (c, next) => {
  const path = c.req.path;
  const rule = rateLimitRules.find(
    (entry) =>
      path.startsWith(entry.prefix) &&
      (!entry.method || entry.method === c.req.method),
  );
  if (rule) {
    const ip = getClientIp(c);
    const key = `${ip}:${rule.prefix}:${rule.method ?? "ANY"}`;
    const result = rateLimit(key, rule.limit, rule.windowMs);
    if (!result.allowed) {
      c.header(
        "Retry-After",
        String(Math.ceil(result.retryAfterMs / 1000)),
      );
      logWarn("rate_limit.exceeded", {
        requestId: c.get("requestId"),
        path,
        method: c.req.method,
        ip,
      });
      return c.text("Too many requests. Try again shortly.", 429);
    }
  }
  await next();
});

app.use("*", async (c, next) => {
  const start = performance.now();
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  try {
    await next();
  } finally {
    const duration = performance.now() - start;
    const status = c.res.status;
    recordRequest(duration, status);
    logInfo("request.completed", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: Number(duration.toFixed(1)),
    });
  }
});

app.use("*", authMiddleware);
app.route("/auth", authRoutes);

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );

const ProductCard = (
  { product, csrfToken, returnTo }: {
    product: Product;
    csrfToken: string;
    returnTo: string;
  },
) => (
  <article class="card h-full border border-base-300 bg-base-100 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">
    <figure class="relative aspect-[4/3] overflow-hidden bg-base-200">
      {product.badge && (
        <span class="badge badge-primary absolute left-3 top-3">
          {product.badge}
        </span>
      )}
      <img
        src={product.image}
        alt={product.name}
        class="h-full w-full object-cover transition duration-500 hover:scale-105"
        loading="lazy"
      />
    </figure>
    <div class="card-body space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
            {product.category}
          </p>
          <h3 class="text-lg font-semibold">{product.name}</h3>
        </div>
        <div class="text-right">
          <p class="font-semibold text-base-content">
            {formatPrice(product.price)}
          </p>
          {product.rating && (
            <p class="flex items-center justify-end gap-1 text-xs text-warning">
              <span class="mask mask-star-2 bg-warning h-3 w-3" />
              {product.rating.toFixed(1)}
            </p>
          )}
        </div>
      </div>
      <p class="text-sm leading-relaxed text-base-content/70">
        {product.description}
      </p>
      {product.tags && (
        <div class="flex flex-wrap gap-2">
          {product.tags.map((tag) => (
            <span
              class="badge badge-ghost badge-sm"
              key={`${product.id}-${tag}`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <div class="card-actions justify-between pt-2">
        <form method="POST" action="/cart/add">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="quantity" value="1" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" class="btn btn-sm btn-primary">
            Add to bag
          </button>
        </form>
        <a href={`/products/${product.id}`} class="btn btn-sm btn-ghost">
          View details
        </a>
      </div>
    </div>
  </article>
);

const ProductHighlight = (
  { product, csrfToken, returnTo }: {
    product: Product;
    csrfToken: string;
    returnTo: string;
  },
) => (
  <section class="grid gap-6 overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm lg:grid-cols-2">
    <div class="relative">
      {product.badge && (
        <span class="badge badge-primary absolute left-4 top-4">
          {product.badge}
        </span>
      )}
      <img
        src={product.image}
        alt={product.name}
        class="h-full w-full object-cover"
        loading="lazy"
      />
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4 text-primary-content">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.18em] text-primary-content/80">
              Featured
            </p>
            <h3 class="text-xl font-semibold">{product.name}</h3>
          </div>
          <p class="text-lg font-semibold">{formatPrice(product.price)}</p>
        </div>
      </div>
    </div>
    <div class="flex flex-col justify-between gap-6 p-8">
      <div class="space-y-3">
        <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
          {product.category}
        </p>
        <h2 class="text-3xl font-semibold leading-tight">
          Everyday hero piece
        </h2>
        <p class="text-base leading-relaxed text-base-content/70">
          {product.description}{" "}
          Built for commutes, overnights, and everything in between. Pair it
          with our travel lineup for a cohesive kit.
        </p>
        {product.tags && (
          <div class="flex flex-wrap gap-2">
            {product.tags.map((tag) => (
              <span class="badge badge-outline" key={`${product.id}-hl-${tag}`}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          {product.rating && (
            <div class="badge badge-outline badge-primary gap-1">
              <span class="mask mask-star-2 bg-warning h-3 w-3" />
              {product.rating.toFixed(1)} rating
            </div>
          )}
          <p class="text-sm text-base-content/70">Free shipping over $75</p>
        </div>
        <div class="flex gap-2">
          <form method="POST" action="/cart/add">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="quantity" value="1" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" class="btn btn-primary">Add to bag</button>
          </form>
          <a href={`/products/${product.id}`} class="btn btn-ghost">
            View full details
          </a>
        </div>
      </div>
    </div>
  </section>
);

const Navbar = () => (
  <nav class="mb-6 flex items-center justify-between rounded-full bg-base-100/80 px-4 py-3 shadow-sm backdrop-blur">
    <div class="flex items-center gap-3">
      <span class="grid h-10 w-10 place-content-center rounded-full bg-primary text-lg font-semibold text-primary-content">
        HS
      </span>
      <div>
        <a href="/" class="text-sm font-semibold">Hono Shop</a>
        <p class="text-xs text-base-content/60">Daily essentials</p>
      </div>
    </div>
    <div class="hidden items-center gap-3 text-sm sm:flex">
      <a href="/products" class="btn btn-ghost btn-sm">Shop</a>
      <a href="/about" class="btn btn-ghost btn-sm">About</a>
      <a href="/contact" class="btn btn-ghost btn-sm">Contact</a>
    </div>
    <div class="flex items-center gap-2">
      <a href="/account" class="btn btn-ghost btn-sm">Account</a>
      <a href="/auth/login" class="btn btn-ghost btn-sm">Sign in</a>
      <a href="/cart" class="btn btn-primary btn-sm">Cart</a>
    </div>
  </nav>
);

const Hero = () => (
  <section class="relative overflow-hidden rounded-3xl border border-base-300 bg-gradient-to-br from-base-100 via-base-200 to-base-300 px-6 py-10 shadow-sm">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute -left-16 top-6 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
      <div class="absolute right-2 top-10 h-32 w-32 rounded-full bg-secondary/20 blur-3xl" />
      <div class="absolute bottom-0 right-10 h-40 w-40 rounded-full bg-neutral/10 blur-3xl" />
    </div>
    <div class="relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
      <div class="space-y-6">
        <div class="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-primary">
          <span class="badge badge-primary badge-outline">New drop</span>
          <span>Autumn / Winter</span>
        </div>
        <div class="space-y-3">
          <h1 class="text-4xl font-bold leading-tight sm:text-5xl">
            Modern staples for work, travel, and home.
          </h1>
          <p class="max-w-2xl text-base leading-relaxed text-base-content/70">
            Build a refined everyday kit with breathable layers, durable carry,
            and elevated home essentials.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <a href="/products" class="btn btn-primary btn-lg">Shop arrivals</a>
          <a href="/products" class="btn btn-outline btn-lg">Build your kit</a>
        </div>
        <div class="grid gap-4 text-sm sm:grid-cols-3">
          {[
            { label: "Free shipping", detail: "Orders over $75" },
            { label: "45-day returns", detail: "Easy exchanges" },
            { label: "Ethical sourcing", detail: "Low-impact materials" },
          ].map((item) => (
            <div
              key={item.label}
              class="rounded-xl border border-base-300 bg-base-100/60 p-3"
            >
              <p class="font-semibold">{item.label}</p>
              <p class="text-base-content/70">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
      <div class="relative overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-lg">
        <img
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=80"
          alt="Editorial hero"
          class="h-full w-full object-cover"
          loading="lazy"
        />
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4 text-primary-content">
          <p class="text-xs uppercase tracking-[0.18em] text-primary-content/80">
            Spotlight
          </p>
          <div class="flex items-center justify-between">
            <p class="text-lg font-semibold">Transit-ready layers</p>
            <p class="text-sm">View lookbook</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const CategoryPills = () => (
  <section class="flex flex-wrap gap-3">
    {categories.map((category) => (
      <a
        key={category}
        href={`/products?category=${encodeURIComponent(category)}`}
        class="btn btn-sm rounded-full border-base-300 bg-base-100 text-sm"
      >
        {category}
      </a>
    ))}
  </section>
);

const Perks = () => (
  <section class="grid gap-4 rounded-box bg-base-100 p-6 shadow-sm sm:grid-cols-3">
    {[
      {
        title: "Thoughtful materials",
        copy:
          "Organic cotton, recycled rubber, and FSC-certified wood accents.",
      },
      {
        title: "Flexible payments",
        copy: "Split your order at checkout with no added fees.",
      },
      {
        title: "Dedicated support",
        copy: "Fit guidance, care tips, and styling help when you need it.",
      },
    ].map((perk) => (
      <div key={perk.title} class="space-y-1">
        <p class="text-sm uppercase tracking-[0.18em] text-primary">
          {perk.title}
        </p>
        <p class="text-sm leading-relaxed text-base-content/70">{perk.copy}</p>
      </div>
    ))}
  </section>
);

const Footer = () => (
  <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-6 text-sm text-base-content/70">
    <p>© {new Date().getFullYear()} Hono Shop. Crafted for Deno + Hono.</p>
    <div class="flex gap-3">
      <a class="link link-hover" href="/privacy">Privacy</a>
      <a class="link link-hover" href="/terms">Terms</a>
      <a class="link link-hover" href="/contact">Contact</a>
    </div>
  </footer>
);

const PageShell = ({ children }: { children: Child }) => (
  <div class="min-h-screen bg-base-200">
    <div class="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <Navbar />
      {children}
      <Footer />
    </div>
  </div>
);

const ShopHomePage = ({ csrfToken }: { csrfToken: string }) => {
  const [featured, ...rest] = products;
  const returnTo = "/";

  return (
    <PageShell>
      <main class="flex flex-col gap-10">
        <Hero />
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
                Curated categories
              </p>
              <h2 class="text-2xl font-semibold">Shop by interest</h2>
            </div>
            <a href="/products" class="btn btn-ghost btn-sm">View all</a>
          </div>
          <CategoryPills />
        </div>
        <ProductHighlight
          product={featured}
          csrfToken={csrfToken}
          returnTo={returnTo}
        />
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
                New in the shop
              </p>
              <h2 class="text-2xl font-semibold">
                Fresh arrivals for the season
              </h2>
            </div>
            <a href="/products" class="btn btn-outline btn-sm">Filter</a>
          </div>
          <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((product) => (
              <ProductCard
                product={product}
                csrfToken={csrfToken}
                returnTo={returnTo}
                key={product.id}
              />
            ))}
          </div>
        </section>
        <Perks />
      </main>
    </PageShell>
  );
};

type DbProduct = Awaited<
  ReturnType<typeof productRepository.listActive>
>[number];

const demoCatalog: DbProduct[] = products.map((product) => ({
  id: product.id,
  slug: product.id,
  name: product.name,
  description: product.description,
  category: product.category,
  sku: null,
  stock: null,
  priceCents: Math.round(product.price * 100),
  currency: "USD",
  active: true,
  images: [product.image],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

type DbCartItemRow = Awaited<
  ReturnType<typeof cartRepository.listWithProducts>
>[number];

type CartItem = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  images: string[] | null;
  active: boolean;
  quantity: number;
  priceCents: number;
  currency: string;
  subtotalCents: number;
};

const stripeEnabled = Boolean(
  stripeConfig.secretKey &&
    stripeConfig.publishableKey &&
    stripeConfig.webhookSecret,
);

type AccountOrder = Awaited<
  ReturnType<typeof orderRepository.listByUser>
>[number];

type AccountAddress = Awaited<
  ReturnType<typeof addressRepository.listByUser>
>[number];

type OrderItem = Awaited<
  ReturnType<typeof orderItemRepository.listByOrderId>
>[number];

type AuditLogEntry = Awaited<
  ReturnType<typeof auditLogRepository.listRecent>
>[number];

type AdminUser = Awaited<ReturnType<typeof userRepository.listAll>>[number];

type AdminOrder = Awaited<ReturnType<typeof orderRepository.listAll>>[number];

const getStripeClient = () => {
  if (!stripeConfig.secretKey) {
    throw new Error("Stripe secret key is not configured.");
  }
  return new Stripe(stripeConfig.secretKey, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
    appInfo: { name: "deno-hono-shop" },
  });
};

const formatMoneyCents = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );

const getPrimaryImage = (images: string[] | null) =>
  images?.[0] ??
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80";

const cspDirectives = [
  "default-src 'self'",
  "img-src 'self' data: https://images.unsplash.com https://images.ctfassets.net https://*.unsplash.com *",
  "script-src 'self' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com",
  "frame-src https://js.stripe.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "base-uri 'self'",
].join("; ");

type RateLimitRule = {
  prefix: string;
  limit: number;
  windowMs: number;
  method?: string;
};

const rateLimit = (key: string, limit: number, windowMs: number) => {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateLimitBuckets.set(key, { resetAt: now + windowMs, count: 1 });
    return { allowed: true, remaining: limit - 1, retryAfterMs: windowMs };
  }
  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, bucket.resetAt - now),
    };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
};

const rateLimitRules: RateLimitRule[] = [
  { prefix: "/auth/login", limit: 10, windowMs: 60_000, method: "POST" },
  { prefix: "/auth/register", limit: 6, windowMs: 60_000, method: "POST" },
  { prefix: "/webhooks/stripe", limit: 120, windowMs: 60_000, method: "POST" },
];

const getClientIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
  c.req.header("cf-connecting-ip") ||
  c.req.header("x-real-ip") ||
  "unknown";

const ensureCartSession = (c: Context) => {
  let sessionId = getCookie(c, cartCookieName);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    setCookie(c, cartCookieName, sessionId, {
      httpOnly: true,
      sameSite: "Lax",
      secure: isProdLike,
      path: "/",
    });
  }
  return sessionId;
};

const mapCartItem = (row: DbCartItemRow): CartItem => ({
  id: row.id,
  productId: row.productId,
  slug: row.productSlug,
  name: row.productName,
  description: row.productDescription,
  category: row.productCategory,
  images: row.productImages,
  active: row.productActive,
  quantity: row.quantity,
  priceCents: row.priceCents,
  currency: row.currency,
  subtotalCents: row.priceCents * row.quantity,
});

const loadCart = async (c: Context) => {
  const sessionId = ensureCartSession(c);
  const authUser = c.get("user") as AuthUser | undefined;
  const cart = await cartRepository.getOrCreateBySession(
    sessionId,
    authUser?.id ?? null,
  );
  if (authUser?.id) {
    await cartRepository.attachUser(cart.id, authUser.id);
  }
  const items = (await cartRepository.listWithProducts(cart.id)).map(
    mapCartItem,
  );
  const subtotalCents = items.reduce(
    (total, item) => total + item.subtotalCents,
    0,
  );
  const currency = items[0]?.currency ?? "USD";

  return { cartId: cart.id, sessionId, items, subtotalCents, currency };
};

const requestOrigin = (c: Context) => {
  const host = c.req.header("host") ?? "localhost:8000";
  const proto = c.req.header("x-forwarded-proto") ??
    (isProdLike ? "https" : "http");
  return `${proto}://${host}`;
};

const Breadcrumbs = (
  { items }: { items: { label: string; href?: string }[] },
) => (
  <div class="text-sm breadcrumbs">
    <ul>
      {items.map((item) => (
        <li key={item.label}>
          {item.href
            ? <a href={item.href}>{item.label}</a>
            : <span>{item.label}</span>}
        </li>
      ))}
    </ul>
  </div>
);

const DbProductCard = (
  { product, csrfToken, returnTo }: {
    product: DbProduct;
    csrfToken: string;
    returnTo: string;
  },
) => (
  <article class="card h-full border border-base-300 bg-base-100 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">
    <figure class="relative aspect-[4/3] overflow-hidden bg-base-200">
      <img
        src={getPrimaryImage(product.images)}
        alt={product.name}
        class="h-full w-full object-cover transition duration-500 hover:scale-105"
        loading="lazy"
      />
    </figure>
    <div class="card-body space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          {product.category && (
            <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
              {product.category}
            </p>
          )}
          <h3 class="text-lg font-semibold">{product.name}</h3>
        </div>
        <div class="text-right">
          <p class="font-semibold text-base-content">
            {formatMoneyCents(product.priceCents, product.currency)}
          </p>
        </div>
      </div>
      <p class="text-sm leading-relaxed text-base-content/70">
        {product.description ?? "—"}
      </p>
      <div class="card-actions justify-between pt-2">
        <form method="POST" action="/cart/add">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="quantity" value="1" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" class="btn btn-sm btn-primary">
            Add to cart
          </button>
        </form>
        <a href={`/products/${product.slug}`} class="btn btn-sm btn-ghost">
          View details
        </a>
      </div>
    </div>
  </article>
);

type ProductsPageProps = {
  products: DbProduct[];
  categories: string[];
  selectedCategory: string;
  query: string;
  page: number;
  totalPages: number;
  totalCount: number;
  dbError: boolean;
  prevHref: string | null;
  nextHref: string | null;
  csrfToken: string;
  returnTo: string;
};

const ProductsPage = ({
  products,
  categories,
  selectedCategory,
  query,
  page,
  totalPages,
  totalCount,
  dbError,
  prevHref,
  nextHref,
  csrfToken,
  returnTo,
}: ProductsPageProps) => (
  <PageShell>
    <main class="space-y-6">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-2">
          <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
            Shop
          </p>
          <h1 class="text-3xl font-bold sm:text-4xl">Browse products</h1>
          <p class="max-w-2xl text-sm leading-relaxed text-base-content/70">
            Filter by category or search by name. This is server-rendered and
            ready for a real catalog.
          </p>
        </div>
        <form
          method="GET"
          class="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <input
            class="input input-bordered input-sm w-full sm:w-56"
            name="q"
            value={query}
            placeholder="Search products…"
          />
          <select
            class="select select-bordered select-sm w-full sm:w-44"
            name="category"
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option
                value={category}
                selected={category === selectedCategory}
                key={category}
              >
                {category}
              </option>
            ))}
          </select>
          <button type="submit" class="btn btn-primary btn-sm">Apply</button>
        </form>
      </header>

      {dbError && (
        <div class="alert alert-warning text-sm">
          Could not load products from the database. Check `DATABASE_URL` and
          your schema.
        </div>
      )}

      <div class="flex items-center justify-between text-sm text-base-content/70">
        <p>
          {totalCount} product{totalCount === 1 ? "" : "s"}
        </p>
        <p>
          Page {page} / {totalPages}
        </p>
      </div>

      {products.length === 0
        ? (
          <div class="rounded-2xl border border-base-300 bg-base-100 p-8 text-center shadow-sm">
            <h2 class="text-xl font-semibold">No products yet</h2>
            <p class="mt-2 text-sm text-base-content/70">
              Add rows to the `Product` table (or run the demo seed) to see
              items here.
            </p>
          </div>
        )
        : (
          <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <DbProductCard
                product={product}
                csrfToken={csrfToken}
                returnTo={returnTo}
                key={product.id}
              />
            ))}
          </div>
        )}

      <div class="flex items-center justify-between pt-4">
        <a
          class={`btn btn-outline btn-sm ${prevHref ? "" : "btn-disabled"}`}
          href={prevHref ?? "#"}
          aria-disabled={prevHref ? "false" : "true"}
        >
          Previous
        </a>
        <a
          class={`btn btn-outline btn-sm ${nextHref ? "" : "btn-disabled"}`}
          href={nextHref ?? "#"}
          aria-disabled={nextHref ? "false" : "true"}
        >
          Next
        </a>
      </div>
    </main>
  </PageShell>
);

const ProductDetailPage = (
  { product, csrfToken, returnTo }: {
    product: DbProduct;
    csrfToken: string;
    returnTo: string;
  },
) => (
  <PageShell>
    <main class="space-y-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Shop", href: "/products" },
          { label: product.name },
        ]}
      />
      <div class="grid gap-10 lg:grid-cols-2">
        <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
          <img
            src={getPrimaryImage(product.images)}
            alt={product.name}
            class="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
        <div class="space-y-5">
          {product.category && (
            <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
              {product.category}
            </p>
          )}
          <h1 class="text-4xl font-bold leading-tight">{product.name}</h1>
          <p class="text-xl font-semibold">
            {formatMoneyCents(product.priceCents, product.currency)}
          </p>
          <p class="text-base leading-relaxed text-base-content/70">
            {product.description ?? "—"}
          </p>
          <div class="flex flex-wrap gap-3">
            <form method="POST" action="/cart/add">
              <input type="hidden" name="_csrf" value={csrfToken} />
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="quantity" value="1" />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button type="submit" class="btn btn-primary">
                Add to cart
              </button>
            </form>
            <a href="/products" class="btn btn-outline">Back to shop</a>
          </div>
        </div>
      </div>
    </main>
  </PageShell>
);

const SimplePage = (
  { title, children }: { title: string; children: Child },
) => (
  <PageShell>
    <main class="mx-auto max-w-4xl space-y-6">
      <h1 class="text-3xl font-bold">{title}</h1>
      <div class="space-y-4 text-base leading-relaxed text-base-content/80">
        {children}
      </div>
    </main>
  </PageShell>
);

const NotFoundPage = () => (
  <PageShell>
    <main class="mx-auto max-w-4xl pt-12 text-center space-y-4">
      <h1 class="text-3xl font-bold">Page not found</h1>
      <p class="text-base-content/70">
        The page you requested doesn&apos;t exist.
      </p>
      <a href="/" class="btn btn-primary btn-sm">Back home</a>
    </main>
  </PageShell>
);

const ServerErrorPage = ({ requestId }: { requestId?: string }) => (
  <PageShell>
    <main class="mx-auto max-w-3xl pt-12 text-center space-y-4">
      <h1 class="text-3xl font-bold">Something went wrong</h1>
      <p class="text-base-content/70">
        We couldn&apos;t complete your request. Please refresh or try again in a
        moment.
      </p>
      {requestId && (
        <p class="text-sm text-base-content/60">
          Request ID: <span class="font-mono">{requestId}</span>
        </p>
      )}
      <div class="flex justify-center gap-2">
        <a href="/" class="btn btn-primary btn-sm">Back home</a>
        <a href="/contact" class="btn btn-ghost btn-sm">Contact support</a>
      </div>
    </main>
  </PageShell>
);

type CartPageProps = {
  items: CartItem[];
  subtotalCents: number;
  currency: string;
  stripeEnabled: boolean;
  csrfToken: string;
  message?: string;
};

const CartPage = ({
  items,
  subtotalCents,
  currency,
  stripeEnabled,
  csrfToken,
  message,
}: CartPageProps) => (
  <PageShell>
    <main class="space-y-8">
      <header class="space-y-2">
        <p class="text-xs uppercase tracking-[0.18em] text-primary/80">Cart</p>
        <h1 class="text-3xl font-bold sm:text-4xl">Your bag</h1>
        <p class="text-sm text-base-content/70">
          Items are stored server-side. Checkout is powered by Stripe.
        </p>
        {message && (
          <div class="alert alert-info text-sm">
            {message}
          </div>
        )}
      </header>

      {items.length === 0
        ? (
          <div class="rounded-2xl border border-base-300 bg-base-100 p-8 text-center shadow-sm space-y-3">
            <h2 class="text-xl font-semibold">Your cart is empty</h2>
            <p class="text-sm text-base-content/70">
              Add a few items to get started.
            </p>
            <div class="flex justify-center gap-2">
              <a href="/products" class="btn btn-primary btn-sm">
                Shop products
              </a>
              <a href="/" class="btn btn-ghost btn-sm">Back home</a>
            </div>
          </div>
        )
        : (
          <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div class="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm flex gap-4"
                >
                  <div class="h-24 w-24 overflow-hidden rounded-lg bg-base-200">
                    <img
                      src={getPrimaryImage(item.images)}
                      alt={item.name}
                      class="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div class="flex-1 space-y-2">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <a
                          href={`/products/${item.slug}`}
                          class="text-lg font-semibold"
                        >
                          {item.name}
                        </a>
                        <p class="text-sm text-base-content/60">
                          {item.category ?? "—"}
                        </p>
                        {!item.active && (
                          <p class="text-xs text-warning mt-1">
                            This item is no longer available. Remove it to
                            continue.
                          </p>
                        )}
                      </div>
                      <p class="font-semibold">
                        {formatMoneyCents(item.priceCents, item.currency)}
                      </p>
                    </div>
                    <p class="text-sm text-base-content/70">
                      {item.description ?? "—"}
                    </p>
                    <div class="flex flex-wrap items-center gap-3">
                      <form
                        class="flex items-center gap-2"
                        method="POST"
                        action="/cart/update"
                      >
                        <input type="hidden" name="_csrf" value={csrfToken} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <input
                          type="number"
                          name="quantity"
                          min="0"
                          value={item.quantity}
                          class="input input-bordered input-sm w-24"
                        />
                        <button type="submit" class="btn btn-sm btn-outline">
                          Update
                        </button>
                      </form>
                      <p class="text-sm text-base-content/70">
                        Subtotal:{" "}
                        {formatMoneyCents(item.subtotalCents, item.currency)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <form method="POST" action="/cart/clear">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <button type="submit" class="btn btn-sm btn-ghost">
                  Clear cart
                </button>
              </form>
            </div>

            <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-4">
              <h2 class="text-lg font-semibold">Order summary</h2>
              <div class="flex items-center justify-between text-sm">
                <p>Subtotal</p>
                <p>{formatMoneyCents(subtotalCents, currency)}</p>
              </div>
              <div class="flex items-center justify-between text-sm">
                <p>Shipping</p>
                <p class="text-base-content/60">Calculated at checkout</p>
              </div>
              <div class="divider my-1" />
              <div class="flex items-center justify-between text-base font-semibold">
                <p>Total</p>
                <p>{formatMoneyCents(subtotalCents, currency)}</p>
              </div>
              {!stripeEnabled && (
                <div class="alert alert-warning text-sm">
                  Stripe keys are not configured. Add `STRIPE_SECRET_KEY` and
                  `STRIPE_PUBLISHABLE_KEY` to enable checkout.
                </div>
              )}
              <form method="POST" action="/checkout" class="space-y-2">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <button
                  type="submit"
                  class={`btn btn-primary w-full ${
                    stripeEnabled ? "" : "btn-disabled"
                  }`}
                  aria-disabled={stripeEnabled ? "false" : "true"}
                >
                  Checkout with Stripe
                </button>
                <p class="text-xs text-base-content/60">
                  By checking out you agree to our terms and privacy policy.
                </p>
              </form>
            </div>
          </div>
        )}
    </main>
  </PageShell>
);

const CheckoutResultPage = (
  { title, body }: { title: string; body: string },
) => (
  <PageShell>
    <main class="mx-auto max-w-2xl space-y-4">
      <h1 class="text-3xl font-bold">{title}</h1>
      <p class="text-base text-base-content/70">{body}</p>
      <div class="flex gap-2">
        <a href="/products" class="btn btn-primary btn-sm">Continue shopping</a>
        <a href="/account" class="btn btn-ghost btn-sm">Account</a>
      </div>
    </main>
  </PageShell>
);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const statusBadge = (status: OrderStatus) => {
  const base = "badge badge-sm";
  switch (status) {
    case OrderStatus.PAID:
      return `${base} badge-success`;
    case OrderStatus.SHIPPED:
      return `${base} badge-primary`;
    case OrderStatus.REFUNDED:
      return `${base} badge-neutral`;
    case OrderStatus.CANCELLED:
      return `${base} badge-outline`;
    default:
      return `${base} badge-warning`;
  }
};

type AccountPageProps = {
  user: { name?: string | null; email?: string | null; role: Role };
  orders: AccountOrder[];
  addresses: AccountAddress[];
  notice?: string;
  error?: string;
  csrfToken: string;
};

const AccountPage = ({
  user,
  orders,
  addresses,
  notice,
  error,
  csrfToken,
}: AccountPageProps) => {
  const totalSpent = orders.reduce(
    (sum, order) => sum + (order.amountCents ?? 0),
    0,
  );
  return (
    <PageShell>
      <main class="space-y-6">
        <header class="space-y-2">
          <p class="text-xs uppercase tracking-[0.18em] text-primary">
            Account
          </p>
          <h1 class="text-3xl font-bold">
            Welcome{user.name ? `, ${user.name}` : ""}
          </h1>
          <p class="text-sm text-base-content/70">
            View your profile and recent orders. Data is server-rendered on each
            request.
          </p>
        </header>

        {(notice || error) && (
          <div
            class={`alert ${error ? "alert-error" : "alert-success"} text-sm`}
          >
            {error ?? notice}
          </div>
        )}

        <section class="grid gap-4 sm:grid-cols-3">
          <div class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
            <p class="text-sm text-base-content/60">Email</p>
            <p class="font-semibold">{user.email ?? "—"}</p>
          </div>
          <div class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
            <p class="text-sm text-base-content/60">Role</p>
            <p class="font-semibold capitalize">{user.role.toLowerCase()}</p>
          </div>
          <div class="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
            <p class="text-sm text-base-content/60">Total spent</p>
            <p class="font-semibold">{formatMoneyCents(totalSpent || 0)}</p>
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-2">
          <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-4">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
                Profile
              </p>
              <h2 class="text-xl font-semibold">Update profile</h2>
            </div>
            <form method="POST" action="/account/profile" class="space-y-4">
              <input type="hidden" name="_csrf" value={csrfToken} />
              <label class="form-control w-full">
                <span class="label-text">Name</span>
                <input
                  class="input input-bordered w-full"
                  name="name"
                  defaultValue={user.name ?? ""}
                />
              </label>
              <label class="form-control w-full">
                <span class="label-text">Email</span>
                <input
                  class="input input-bordered w-full"
                  type="email"
                  name="email"
                  required
                  defaultValue={user.email ?? ""}
                />
              </label>
              <button type="submit" class="btn btn-primary btn-sm">
                Save profile
              </button>
            </form>
          </div>

          <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-4">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
                Security
              </p>
              <h2 class="text-xl font-semibold">Change password</h2>
            </div>
            <form method="POST" action="/account/password" class="space-y-4">
              <input type="hidden" name="_csrf" value={csrfToken} />
              <label class="form-control w-full">
                <span class="label-text">Current password</span>
                <input
                  class="input input-bordered w-full"
                  type="password"
                  name="currentPassword"
                  autoComplete="current-password"
                />
              </label>
              <label class="form-control w-full">
                <span class="label-text">New password</span>
                <input
                  class="input input-bordered w-full"
                  type="password"
                  name="newPassword"
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              <label class="form-control w-full">
                <span class="label-text">Confirm new password</span>
                <input
                  class="input input-bordered w-full"
                  type="password"
                  name="confirmPassword"
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              <button type="submit" class="btn btn-outline btn-sm">
                Update password
              </button>
            </form>
            <div class="divider my-1" />
            <div class="flex flex-wrap items-center gap-2">
              <form method="POST" action="/auth/logout">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <button type="submit" class="btn btn-ghost btn-sm">
                  Sign out
                </button>
              </form>
              <form method="POST" action="/auth/logout-all">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <button type="submit" class="btn btn-outline btn-sm">
                  Sign out everywhere
                </button>
              </form>
            </div>
          </div>
        </section>

        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
                Addresses
              </p>
              <h2 class="text-xl font-semibold">Address book</h2>
            </div>
            <a href="/account/addresses/new" class="btn btn-primary btn-sm">
              Add address
            </a>
          </div>
          {addresses.length === 0
            ? (
              <div class="rounded-2xl border border-base-300 bg-base-100 p-6 text-center shadow-sm">
                <p class="font-semibold">No saved addresses</p>
                <p class="text-sm text-base-content/70">
                  Add a shipping or billing address to speed up checkout.
                </p>
              </div>
            )
            : (
              <div class="grid gap-4 md:grid-cols-2">
                {addresses.map((address) => (
                  <div
                    key={address.id}
                    class="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm space-y-3"
                  >
                    <div class="flex items-start justify-between">
                      <div>
                        <p class="text-xs uppercase tracking-[0.16em] text-primary/80">
                          {address.type === "BILLING" ? "Billing" : "Shipping"}
                        </p>
                        <h3 class="text-lg font-semibold">
                          {address.label ?? address.name ?? "Address"}
                        </h3>
                      </div>
                      {address.isDefault && (
                        <span class="badge badge-primary badge-sm">
                          Default
                        </span>
                      )}
                    </div>
                    <div class="text-sm text-base-content/70">
                      {address.name && <p>{address.name}</p>}
                      <p>{address.line1}</p>
                      {address.line2 && <p>{address.line2}</p>}
                      <p>
                        {address.city}
                        {address.region ? `, ${address.region}` : ""}{" "}
                        {address.postalCode ?? ""}
                      </p>
                      <p>{address.country}</p>
                      {address.phone && <p>{address.phone}</p>}
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <a
                        href={`/account/addresses/${address.id}/edit`}
                        class="btn btn-outline btn-xs"
                      >
                        Edit
                      </a>
                      {!address.isDefault && (
                        <form
                          method="POST"
                          action={`/account/addresses/${address.id}/default`}
                        >
                          <input type="hidden" name="_csrf" value={csrfToken} />
                          <button type="submit" class="btn btn-ghost btn-xs">
                            Make default
                          </button>
                        </form>
                      )}
                      <form
                        method="POST"
                        action={`/account/addresses/${address.id}/delete`}
                      >
                        <input type="hidden" name="_csrf" value={csrfToken} />
                        <button type="submit" class="btn btn-ghost btn-xs">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
                Orders
              </p>
              <h2 class="text-xl font-semibold">Recent orders</h2>
            </div>
          </div>
          {orders.length === 0
            ? (
              <div class="rounded-2xl border border-base-300 bg-base-100 p-6 text-center shadow-sm space-y-2">
                <p class="font-semibold">No orders yet</p>
                <p class="text-sm text-base-content/70">
                  Once you checkout, your orders will appear here.
                </p>
                <a href="/products" class="btn btn-primary btn-sm">
                  Shop products
                </a>
              </div>
            )
            : (
              <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <a
                            class="link link-primary"
                            href={`/account/orders/${order.id}`}
                          >
                            {order.id.slice(0, 8)}
                          </a>
                        </td>
                        <td>
                          <span class={statusBadge(order.status)}>
                            {order.status}
                          </span>
                        </td>
                        <td>
                          {order.amountCents
                            ? formatMoneyCents(
                              order.amountCents,
                              order.currency ?? "USD",
                            )
                            : "—"}
                        </td>
                        <td>{formatDate(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      </main>
    </PageShell>
  );
};

type AddressFormValues = {
  type: string;
  label: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
};

const AddressFormPage = (
  {
    title,
    action,
    values,
    error,
    csrfToken,
  }: {
    title: string;
    action: string;
    values: AddressFormValues;
    error?: string;
    csrfToken: string;
  },
) => (
  <PageShell>
    <main class="mx-auto max-w-2xl space-y-6">
      <div class="space-y-2">
        <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
          Account
        </p>
        <h1 class="text-3xl font-bold">{title}</h1>
        <p class="text-sm text-base-content/70">
          Keep your shipping and billing details up to date.
        </p>
      </div>
      {error && <div class="alert alert-error text-sm">{error}</div>}
      <form method="POST" action={action} class="space-y-4">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="form-control w-full">
            <span class="label-text">Type</span>
            <select
              class="select select-bordered w-full"
              name="type"
              required
            >
              <option
                value="SHIPPING"
                selected={values.type === "SHIPPING"}
              >
                Shipping
              </option>
              <option value="BILLING" selected={values.type === "BILLING"}>
                Billing
              </option>
            </select>
          </label>
          <label class="form-control w-full">
            <span class="label-text">Label</span>
            <input
              class="input input-bordered w-full"
              name="label"
              placeholder="Home, Studio, Office"
              value={values.label}
            />
          </label>
        </div>
        <label class="form-control w-full">
          <span class="label-text">Full name</span>
          <input
            class="input input-bordered w-full"
            name="name"
            required
            value={values.name}
          />
        </label>
        <label class="form-control w-full">
          <span class="label-text">Address line 1</span>
          <input
            class="input input-bordered w-full"
            name="line1"
            required
            value={values.line1}
          />
        </label>
        <label class="form-control w-full">
          <span class="label-text">Address line 2</span>
          <input
            class="input input-bordered w-full"
            name="line2"
            value={values.line2}
          />
        </label>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="form-control w-full">
            <span class="label-text">City</span>
            <input
              class="input input-bordered w-full"
              name="city"
              required
              value={values.city}
            />
          </label>
          <label class="form-control w-full">
            <span class="label-text">Region / State</span>
            <input
              class="input input-bordered w-full"
              name="region"
              value={values.region}
            />
          </label>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="form-control w-full">
            <span class="label-text">Postal code</span>
            <input
              class="input input-bordered w-full"
              name="postalCode"
              value={values.postalCode}
            />
          </label>
          <label class="form-control w-full">
            <span class="label-text">Country</span>
            <input
              class="input input-bordered w-full"
              name="country"
              required
              value={values.country}
            />
          </label>
        </div>
        <label class="form-control w-full">
          <span class="label-text">Phone</span>
          <input
            class="input input-bordered w-full"
            name="phone"
            value={values.phone}
          />
        </label>
        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            name="isDefault"
            class="checkbox checkbox-primary checkbox-sm"
            checked={values.isDefault}
          />
          <span class="label-text">Set as default for this type</span>
        </label>
        <div class="flex gap-2">
          <button type="submit" class="btn btn-primary btn-sm">
            Save address
          </button>
          <a href="/account" class="btn btn-ghost btn-sm">
            Cancel
          </a>
        </div>
      </form>
    </main>
  </PageShell>
);

const OrderDetailPage = (
  {
    order,
    items,
    history,
  }: { order: AccountOrder; items: OrderItem[]; history: AuditLogEntry[] },
) => (
  <PageShell>
    <main class="space-y-4">
      <Breadcrumbs
        items={[
          { label: "Account", href: "/account" },
          { label: "Orders", href: "/account" },
          { label: order.id.slice(0, 8) },
        ]}
      />
      <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
              Order
            </p>
            <h1 class="text-2xl font-semibold">{order.id}</h1>
          </div>
          <span class={statusBadge(order.status)}>{order.status}</span>
        </div>
        <p class="text-sm text-base-content/70">
          Placed on {formatDate(order.createdAt)}
        </p>
        <p class="text-lg font-semibold">
          {order.amountCents
            ? formatMoneyCents(order.amountCents, order.currency ?? "USD")
            : "—"}
        </p>
        <div class="rounded-xl border border-base-300 bg-base-200/60 p-4 text-sm">
          <p class="font-semibold mb-1">Fulfillment</p>
          <p class="text-base-content/70">
            Shipment status updates are tracked below.
          </p>
        </div>
        <a href="/account" class="btn btn-ghost btn-sm">Back to account</a>
      </div>
      <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Line items</h2>
          <p class="text-sm text-base-content/70">
            {items.length} item{items.length === 1 ? "" : "s"}
          </p>
        </div>
        {items.length === 0
          ? (
            <p class="text-sm text-base-content/70">
              No line items were recorded for this order.
            </p>
          )
          : (
            <div class="overflow-hidden rounded-xl border border-base-300">
              <table class="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.productSlug
                          ? (
                            <a
                              class="link link-primary"
                              href={`/products/${item.productSlug}`}
                            >
                              {item.productName ?? "Product"}
                            </a>
                          )
                          : (item.productName ?? "Product")}
                      </td>
                      <td>{item.quantity}</td>
                      <td>
                        {formatMoneyCents(item.priceCents, item.currency)}
                      </td>
                      <td>
                        {formatMoneyCents(
                          item.priceCents * item.quantity,
                          item.currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
      <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-3">
        <h2 class="text-lg font-semibold">Status history</h2>
        {history.length === 0
          ? (
            <p class="text-sm text-base-content/70">
              No status updates yet.
            </p>
          )
          : (
            <div class="space-y-2 text-sm">
              {history.map((entry) => {
                const metadata = entry.metadata as
                  | Record<string, unknown>
                  | null;
                const from = typeof metadata?.from === "string"
                  ? metadata.from
                  : null;
                const to = typeof metadata?.to === "string"
                  ? metadata.to
                  : null;
                const source = typeof metadata?.source === "string"
                  ? metadata.source
                  : null;
                const actor = entry.actorEmail ?? entry.actorRole ?? "System";
                return (
                  <div
                    key={entry.id}
                    class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-200 bg-base-200/40 px-3 py-2"
                  >
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-semibold">
                        {to ?? "Status update"}
                      </span>
                      {from && to && (
                        <span class="text-base-content/60">
                          {from} → {to}
                        </span>
                      )}
                      <span class="text-base-content/60">
                        by {actor}
                        {source ? ` (${source})` : ""}
                      </span>
                    </div>
                    <span class="text-base-content/60">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </main>
  </PageShell>
);

type AdminOrdersPageProps = {
  orders: AdminOrder[];
  csrfToken: string;
};

const AdminOrdersPage = ({ orders, csrfToken }: AdminOrdersPageProps) => (
  <PageShell>
    <main class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
            Admin
          </p>
          <h1 class="text-3xl font-bold">Orders</h1>
        </div>
        <a href="/admin" class="btn btn-ghost btn-sm">Back to admin</a>
      </div>
      <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Order</th>
              <th>User</th>
              <th>Status</th>
              <th>Total</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <a
                    class="link link-primary"
                    href={`/admin/orders/${order.id}`}
                  >
                    {order.id.slice(0, 8)}
                  </a>
                </td>
                <td>{order.userId ?? "Guest"}</td>
                <td>
                  <span class={statusBadge(order.status)}>{order.status}</span>
                </td>
                <td>
                  {order.amountCents
                    ? formatMoneyCents(
                      order.amountCents,
                      order.currency ?? "USD",
                    )
                    : "—"}
                </td>
                <td>{formatDate(order.createdAt)}</td>
                <td>
                  <div class="flex flex-wrap gap-2">
                    {[
                      OrderStatus.PAID,
                      OrderStatus.SHIPPED,
                      OrderStatus.REFUNDED,
                      OrderStatus.CANCELLED,
                    ].map((status) => (
                      <form
                        method="POST"
                        action="/admin/orders/status"
                        key={`${order.id}-${status}`}
                      >
                        <input type="hidden" name="_csrf" value={csrfToken} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="status" value={status} />
                        <button
                          type="submit"
                          class={`btn btn-xs ${
                            order.status === status
                              ? "btn-disabled"
                              : "btn-outline"
                          }`}
                        >
                          {status.toLowerCase()}
                        </button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  </PageShell>
);

const AdminOrderDetailPage = (
  {
    order,
    items,
    history,
    userEmail,
    csrfToken,
  }: {
    order: AdminOrder;
    items: OrderItem[];
    history: AuditLogEntry[];
    userEmail?: string | null;
    csrfToken: string;
  },
) => (
  <PageShell>
    <main class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
            Admin
          </p>
          <h1 class="text-3xl font-bold">Order {order.id.slice(0, 8)}</h1>
          <p class="text-sm text-base-content/70">
            {userEmail ?? order.userId ?? "Guest"} ·{" "}
            {formatDate(order.createdAt)}
          </p>
        </div>
        <a href="/admin/orders" class="btn btn-ghost btn-sm">
          Back to orders
        </a>
      </div>

      <div class="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">Line items</h2>
            <p class="text-sm text-base-content/70">
              {items.length} item{items.length === 1 ? "" : "s"}
            </p>
          </div>
          {items.length === 0
            ? (
              <p class="text-sm text-base-content/70">
                No line items recorded.
              </p>
            )
            : (
              <div class="overflow-hidden rounded-xl border border-base-300">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.productSlug
                            ? (
                              <a
                                class="link link-primary"
                                href={`/products/${item.productSlug}`}
                              >
                                {item.productName ?? "Product"}
                              </a>
                            )
                            : (item.productName ?? "Product")}
                        </td>
                        <td>{item.quantity}</td>
                        <td>
                          {formatMoneyCents(
                            item.priceCents,
                            item.currency,
                          )}
                        </td>
                        <td>
                          {formatMoneyCents(
                            item.priceCents * item.quantity,
                            item.currency,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>

        <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-4">
          <div>
            <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
              Status
            </p>
            <h2 class="text-xl font-semibold">{order.status}</h2>
            <p class="text-sm text-base-content/70">
              Total: {order.amountCents
                ? formatMoneyCents(order.amountCents, order.currency ?? "USD")
                : "—"}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            {[
              OrderStatus.PAID,
              OrderStatus.SHIPPED,
              OrderStatus.REFUNDED,
              OrderStatus.CANCELLED,
            ].map((status) => (
              <form
                method="POST"
                action="/admin/orders/status"
                key={`${order.id}-${status}`}
              >
                <input type="hidden" name="_csrf" value={csrfToken} />
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="status" value={status} />
                <button
                  type="submit"
                  class={`btn btn-xs ${
                    order.status === status ? "btn-disabled" : "btn-outline"
                  }`}
                >
                  {status.toLowerCase()}
                </button>
              </form>
            ))}
          </div>
          <div class="divider" />
          <div class="space-y-2 text-sm">
            <p class="font-semibold">Status history</p>
            {history.length === 0
              ? <p class="text-base-content/70">No updates yet.</p>
              : (
                history.map((entry) => {
                  const metadata = entry.metadata as
                    | Record<string, unknown>
                    | null;
                  const from = typeof metadata?.from === "string"
                    ? metadata.from
                    : null;
                  const to = typeof metadata?.to === "string"
                    ? metadata.to
                    : null;
                  const source = typeof metadata?.source === "string"
                    ? metadata.source
                    : null;
                  const actor = entry.actorEmail ?? entry.actorRole ?? "System";
                  return (
                    <div key={entry.id} class="text-base-content/70">
                      <span class="font-semibold">{to ?? "Status update"}</span>
                      {from && to && <span>· {from} → {to}</span>}
                      <span>· {actor}</span>
                      {source && <span>({source})</span>}
                      <span>· {formatDateTime(entry.createdAt)}</span>
                    </div>
                  );
                })
              )}
          </div>
        </div>
      </div>
    </main>
  </PageShell>
);

type AdminProductsPageProps = {
  products: DbProduct[];
  csrfToken: string;
  notice?: string;
};

const AdminProductsPage = (
  { products, csrfToken, notice }: AdminProductsPageProps,
) => (
  <PageShell>
    <main class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
            Admin
          </p>
          <h1 class="text-3xl font-bold">Products</h1>
        </div>
        <div class="flex items-center gap-2">
          <a href="/admin/products/new" class="btn btn-primary btn-sm">
            New product
          </a>
          <a href="/admin" class="btn btn-ghost btn-sm">Back to admin</a>
        </div>
      </div>
      {notice && <div class="alert alert-success text-sm">{notice}</div>}
      <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Category</th>
              <th>SKU</th>
              <th>Stock</th>
              <th>Price</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{product.slug}</td>
                <td>{product.category ?? "—"}</td>
                <td>{product.sku ?? "—"}</td>
                <td>{product.stock ?? "—"}</td>
                <td>
                  {formatMoneyCents(product.priceCents, product.currency)}
                </td>
                <td>{product.active ? "Active" : "Archived"}</td>
                <td>
                  <div class="flex flex-wrap gap-2">
                    <a
                      href={`/admin/products/${product.id}/edit`}
                      class="btn btn-ghost btn-xs"
                    >
                      Edit
                    </a>
                    <form
                      method="POST"
                      action={`/admin/products/${product.id}/status`}
                    >
                      <input type="hidden" name="_csrf" value={csrfToken} />
                      <input
                        type="hidden"
                        name="active"
                        value={product.active ? "false" : "true"}
                      />
                      <button type="submit" class="btn btn-ghost btn-xs">
                        {product.active ? "Archive" : "Activate"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  </PageShell>
);

type AdminProductFormValues = {
  name: string;
  slug: string;
  category: string;
  sku: string;
  stock: string;
  price: string;
  currency: string;
  description: string;
  images: string;
  active: boolean;
};

const AdminProductFormPage = (
  {
    title,
    action,
    values,
    error,
    csrfToken,
  }: {
    title: string;
    action: string;
    values: AdminProductFormValues;
    error?: string;
    csrfToken: string;
  },
) => (
  <PageShell>
    <main class="mx-auto max-w-3xl space-y-6">
      <div class="flex items-center justify-between">
        <div class="space-y-2">
          <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
            Admin
          </p>
          <h1 class="text-3xl font-bold">{title}</h1>
        </div>
        <a href="/admin/products" class="btn btn-ghost btn-sm">
          Back to products
        </a>
      </div>
      {error && <div class="alert alert-error text-sm">{error}</div>}
      <form method="POST" action={action} class="space-y-5">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="form-control w-full">
            <span class="label-text">Name</span>
            <input
              class="input input-bordered w-full"
              name="name"
              required
              value={values.name}
            />
          </label>
          <label class="form-control w-full">
            <span class="label-text">Slug</span>
            <input
              class="input input-bordered w-full"
              name="slug"
              placeholder="auto-generated if empty"
              value={values.slug}
            />
          </label>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="form-control w-full">
            <span class="label-text">Category</span>
            <input
              class="input input-bordered w-full"
              name="category"
              value={values.category}
            />
          </label>
          <label class="form-control w-full">
            <span class="label-text">SKU</span>
            <input
              class="input input-bordered w-full"
              name="sku"
              value={values.sku}
            />
          </label>
          <label class="form-control w-full">
            <span class="label-text">Stock</span>
            <input
              class="input input-bordered w-full"
              name="stock"
              inputMode="numeric"
              value={values.stock}
            />
          </label>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <label class="form-control w-full">
            <span class="label-text">Price (USD)</span>
            <input
              class="input input-bordered w-full"
              name="price"
              required
              inputMode="decimal"
              value={values.price}
            />
          </label>
          <label class="form-control w-full">
            <span class="label-text">Currency</span>
            <input
              class="input input-bordered w-full"
              name="currency"
              value={values.currency}
            />
          </label>
          <label class="label cursor-pointer justify-start gap-3 mt-7">
            <input
              type="checkbox"
              name="active"
              class="checkbox checkbox-primary checkbox-sm"
              checked={values.active}
            />
            <span class="label-text">Active</span>
          </label>
        </div>
        <label class="form-control w-full">
          <span class="label-text">Description</span>
          <textarea
            class="textarea textarea-bordered min-h-[120px]"
            name="description"
            value={values.description}
          />
        </label>
        <label class="form-control w-full">
          <span class="label-text">Image URLs</span>
          <textarea
            class="textarea textarea-bordered min-h-[120px]"
            name="images"
            placeholder="One URL per line"
            value={values.images}
          />
        </label>
        <div class="flex gap-2">
          <button type="submit" class="btn btn-primary btn-sm">
            Save product
          </button>
          <a href="/admin/products" class="btn btn-ghost btn-sm">
            Cancel
          </a>
        </div>
      </form>
    </main>
  </PageShell>
);

const AdminUsersPage = (
  {
    users,
    csrfToken,
    notice,
  }: {
    users: AdminUser[];
    csrfToken: string;
    notice?: string;
  },
) => (
  <PageShell>
    <main class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
            Admin
          </p>
          <h1 class="text-3xl font-bold">Users</h1>
        </div>
        <a href="/admin" class="btn btn-ghost btn-sm">
          Back to admin
        </a>
      </div>
      {notice && <div class="alert alert-success text-sm">{notice}</div>}
      <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.name ?? "—"}</td>
                <td class="capitalize">{user.role.toLowerCase()}</td>
                <td>{user.isActive ? "Active" : "Disabled"}</td>
                <td>{formatDate(user.createdAt)}</td>
                <td>
                  <div class="flex flex-wrap gap-2">
                    <form method="POST" action={`/admin/users/${user.id}/role`}>
                      <input type="hidden" name="_csrf" value={csrfToken} />
                      <select
                        class="select select-bordered select-xs"
                        name="role"
                      >
                        {[Role.CUSTOMER, Role.STAFF, Role.ADMIN].map(
                          (role) => (
                            <option
                              value={role}
                              key={role}
                              selected={role === user.role}
                            >
                              {role}
                            </option>
                          ),
                        )}
                      </select>
                      <button type="submit" class="btn btn-ghost btn-xs">
                        Update
                      </button>
                    </form>
                    <form
                      method="POST"
                      action={`/admin/users/${user.id}/status`}
                    >
                      <input type="hidden" name="_csrf" value={csrfToken} />
                      <input
                        type="hidden"
                        name="active"
                        value={user.isActive ? "false" : "true"}
                      />
                      <button type="submit" class="btn btn-ghost btn-xs">
                        {user.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  </PageShell>
);

const auditSummary = (entry: AuditLogEntry) => {
  const metadata = entry.metadata as Record<string, unknown> | null;
  if (!metadata) return "";
  const from = typeof metadata.from === "string" ? metadata.from : null;
  const to = typeof metadata.to === "string" ? metadata.to : null;
  if (from && to) return `${from} → ${to}`;
  const detail = typeof metadata.detail === "string" ? metadata.detail : null;
  return detail ?? "";
};

const AdminAuditPage = (
  { entries }: { entries: AuditLogEntry[] },
) => (
  <PageShell>
    <main class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
            Admin
          </p>
          <h1 class="text-3xl font-bold">Audit log</h1>
        </div>
        <a href="/admin" class="btn btn-ghost btn-sm">
          Back to admin
        </a>
      </div>
      <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDateTime(entry.createdAt)}</td>
                <td>{entry.actorEmail ?? entry.actorRole ?? "System"}</td>
                <td>{entry.action}</td>
                <td>
                  {entry.targetType} · {entry.targetId.slice(0, 8)}
                </td>
                <td>{auditSummary(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  </PageShell>
);

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  return floored > 0 ? floored : fallback;
};

const buildProductsHref = (
  options: { page: number; category: string; query: string },
) => {
  const params = new URLSearchParams();
  if (options.query) params.set("q", options.query);
  if (options.category) params.set("category", options.category);
  if (options.page > 1) params.set("page", String(options.page));
  const search = params.toString();
  return search ? `/products?${search}` : "/products";
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const normalizeCurrency = (value: string | undefined) => {
  const trimmed = value?.toString().trim().toUpperCase();
  return trimmed || "USD";
};

const parseImageList = (input: string | undefined) => {
  const items = (input ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
};

const productFormValuesFromRow = (
  product: DbProduct,
): AdminProductFormValues => ({
  name: product.name,
  slug: product.slug,
  category: product.category ?? "",
  sku: product.sku ?? "",
  stock: product.stock !== null ? String(product.stock) : "",
  price: (product.priceCents / 100).toFixed(2),
  currency: product.currency ?? "USD",
  description: product.description ?? "",
  images: product.images?.join("\n") ?? "",
  active: product.active,
});

const productFormValuesFromForm = (
  form: Record<string, string>,
): AdminProductFormValues => ({
  name: normalizeOptional(form.name),
  slug: normalizeOptional(form.slug),
  category: normalizeOptional(form.category),
  sku: normalizeOptional(form.sku),
  stock: normalizeOptional(form.stock),
  price: normalizeOptional(form.price),
  currency: normalizeCurrency(form.currency),
  description: normalizeOptional(form.description),
  images: normalizeOptional(form.images),
  active: form.active === "on" || form.active === "true" || form.active === "1",
});

const parseProductForm = (form: Record<string, string>) => {
  const name = parseString(form.name, "Name", { minLength: 2 });
  const slugInput = normalizeOptional(form.slug);
  const slug = slugInput || (name.ok ? slugify(name.value) : "");
  const priceCents = parseMoneyCents(form.price, "Price");
  const stock = parseOptionalInt(form.stock, "Stock");
  const errors = collectErrors([name, priceCents, stock]);
  if (!slug) {
    errors.push("Slug is required.");
  } else if (!/^[a-z0-9-]+$/.test(slug)) {
    errors.push("Slug must contain only letters, numbers, and dashes.");
  }
  if (errors.length) {
    return { ok: false as const, error: errors.join(" ") };
  }

  return {
    ok: true as const,
    value: {
      name: name.value,
      slug,
      category: toOptionalValue(form.category),
      sku: toOptionalValue(form.sku),
      stock: stock.value,
      priceCents: priceCents.value,
      currency: normalizeCurrency(form.currency),
      description: toOptionalValue(form.description),
      images: parseImageList(form.images),
      active: form.active === "on" || form.active === "true" ||
        form.active === "1",
    },
  };
};

const filterDemoCatalog = (options: { category: string; query: string }) => {
  const normalizedQuery = options.query.trim().toLowerCase();
  const normalizedCategory = options.category.trim().toLowerCase();
  return demoCatalog.filter((product) => {
    if (
      normalizedCategory &&
      product.category?.toLowerCase() !== normalizedCategory
    ) {
      return false;
    }
    if (!normalizedQuery) return true;
    const haystack = `${product.name} ${product.description ?? ""}`
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
};

app.get("/", (c: Context) => {
  const csrfToken = ensureCsrfToken(c);
  return c.render(<ShopHomePage csrfToken={csrfToken} />, {
    title: "Hono Shop",
    description:
      "Modern essentials for work, travel, and home — built with Deno + Hono.",
  });
});

app.get("/products", async (c: Context) => {
  const selectedCategory = (c.req.query("category") ?? "").trim();
  const query = (c.req.query("q") ?? "").trim();
  const pageSize = 12;
  let page = parsePositiveInt(c.req.query("page"), 1);
  const csrfToken = ensureCsrfToken(c);

  let dbError = false;
  let products: DbProduct[] = [];
  let categories: string[] = [];
  let totalCount = 0;
  let totalPages = 1;

  try {
    const [dbCategories, count] = await Promise.all([
      productRepository.listCategories(),
      productRepository.countActive({
        category: selectedCategory || null,
        query: query || null,
      }),
    ]);

    categories = dbCategories.length
      ? dbCategories
      : [...new Set(demoCatalog.map((p) => p.category).filter(Boolean))]
        .sort();

    totalCount = count;
    totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    if (page > totalPages) page = totalPages;

    products = await productRepository.listActive({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      category: selectedCategory || null,
      query: query || null,
    });
  } catch (error) {
    dbError = true;
    const filtered = filterDemoCatalog({ category: selectedCategory, query });
    totalCount = filtered.length;
    totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    if (page > totalPages) page = totalPages;
    products = filtered.slice((page - 1) * pageSize, page * pageSize);
    categories = categories.length
      ? categories
      : [...new Set(filtered.map((p) => p.category).filter(Boolean))].sort();
    logError("products.list.failed", error, {
      requestId: c.get("requestId"),
      category: selectedCategory || null,
      query: query || null,
    });
  }

  const requestUrl = new URL(c.req.url);
  const returnTo = `${requestUrl.pathname}${requestUrl.search}`;

  const prevHref = page > 1
    ? buildProductsHref({ page: page - 1, category: selectedCategory, query })
    : null;
  const nextHref = page < totalPages
    ? buildProductsHref({ page: page + 1, category: selectedCategory, query })
    : null;

  return c.render(
    <ProductsPage
      products={products}
      categories={categories}
      selectedCategory={selectedCategory}
      query={query}
      page={page}
      totalPages={totalPages}
      totalCount={totalCount}
      dbError={dbError}
      prevHref={prevHref}
      nextHref={nextHref}
      csrfToken={csrfToken}
      returnTo={returnTo}
    />,
    {
      title: "Shop · Hono Shop",
      description:
        "Browse products with server-rendered search, filters, and pagination.",
    },
  );
});

app.get("/products/:slug", async (c: Context) => {
  const slug = c.req.param("slug");
  const csrfToken = ensureCsrfToken(c);
  const returnTo = c.req.path;

  try {
    const product = await productRepository.findBySlug(slug);
    if (product) {
      return c.render(
        <ProductDetailPage
          product={product}
          csrfToken={csrfToken}
          returnTo={returnTo}
        />,
        {
          title: `${product.name} · Hono Shop`,
          description: product.description ??
            `Buy ${product.name} on Hono Shop.`,
        },
      );
    }
  } catch (error) {
    logError("products.detail.failed", error, {
      requestId: c.get("requestId"),
      slug,
    });
  }

  const fallback = demoCatalog.find((product) => product.slug === slug);
  if (fallback) {
    return c.render(
      <ProductDetailPage
        product={fallback}
        csrfToken={csrfToken}
        returnTo={returnTo}
      />,
      {
        title: `${fallback.name} · Hono Shop`,
        description: fallback.description ??
          `Buy ${fallback.name} on Hono Shop.`,
      },
    );
  }

  return c.notFound();
});

const parseQuantity = (value: unknown, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  return floored > 0 ? floored : fallback;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);

const safeReturnPath = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
};

app.get("/cart", async (c: Context) => {
  let items: CartItem[] = [];
  let subtotalCents = 0;
  let currency = "USD";
  let message = c.req.query("msg") ?? undefined;
  const csrfToken = ensureCsrfToken(c);

  try {
    const cart = await loadCart(c);
    items = cart.items;
    subtotalCents = cart.subtotalCents;
    currency = cart.currency;
  } catch (error) {
    logError("cart.load.failed", error, {
      requestId: c.get("requestId"),
    });
    message = "Could not load cart. Check database connection.";
  }

  return c.render(
    <CartPage
      items={items}
      subtotalCents={subtotalCents}
      currency={currency}
      stripeEnabled={stripeEnabled}
      csrfToken={csrfToken}
      message={message}
    />,
    { title: "Cart · Hono Shop" },
  );
});

app.post("/cart/add", async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  if (!validateCsrf(c, form._csrf)) {
    return c.redirect("/cart?msg=Session%20expired.", 303);
  }
  const productId = form.productId?.toString().trim();
  const quantity = parseQuantity(form.quantity, 1);
  if (!productId) return c.text("Missing product", 400);

  try {
    const product = (isUuid(productId)
      ? await productRepository.findById(productId)
      : null) ?? await productRepository.findBySlug(productId);
    if (!product) {
      return c.text("Product not found", 404);
    }

    const { cartId } = await loadCart(c);
    await cartRepository.addItem(
      cartId,
      {
        id: product.id,
        priceCents: product.priceCents,
        currency: product.currency,
        name: product.name,
      },
      quantity,
    );
  } catch (error) {
    logError("cart.add.failed", error, {
      requestId: c.get("requestId"),
      productId,
    });
    return c.text("Could not add to cart. Check database connection.", 503);
  }

  const returnTo = safeReturnPath(
    form.returnTo?.toString(),
    "/cart",
  );
  return c.redirect(returnTo, 303);
});

app.post("/cart/update", async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  if (!validateCsrf(c, form._csrf)) {
    return c.redirect("/cart?msg=Session%20expired.", 303);
  }
  const itemId = form.itemId?.toString();
  const quantity = parseQuantity(form.quantity, 0);
  if (!itemId) return c.text("Missing cart item", 400);

  try {
    const { cartId } = await loadCart(c);
    await cartRepository.updateQuantity(cartId, itemId, quantity);
  } catch (error) {
    logError("cart.update.failed", error, {
      requestId: c.get("requestId"),
      itemId,
    });
    return c.text("Could not update cart. Check database connection.", 503);
  }
  return c.redirect("/cart", 303);
});

app.post("/cart/clear", async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  if (!validateCsrf(c, form._csrf)) {
    return c.redirect("/cart?msg=Session%20expired.", 303);
  }
  try {
    const { cartId } = await loadCart(c);
    await cartRepository.clear(cartId);
  } catch (error) {
    logError("cart.clear.failed", error, {
      requestId: c.get("requestId"),
    });
    return c.text("Could not clear cart. Check database connection.", 503);
  }
  return c.redirect("/cart", 303);
});

app.post("/checkout", async (c: Context) => {
  if (!stripeEnabled || !stripeConfig.webhookSecret) {
    return c.text(
      "Stripe is not configured. Add STRIPE keys to continue.",
      503,
    );
  }

  const form = await c.req.parseBody() as Record<string, string>;
  if (!validateCsrf(c, form._csrf)) {
    return c.redirect("/cart?msg=Session%20expired.", 303);
  }

  let items: CartItem[] = [];
  let subtotalCents = 0;
  let currency = "USD";
  let cartId: string | null = null;
  const authUser = c.get("user") as AuthUser | undefined;

  try {
    const cart = await loadCart(c);
    items = cart.items;
    subtotalCents = cart.subtotalCents;
    currency = cart.currency;
    cartId = cart.cartId;
  } catch (error) {
    logError("checkout.cart_load_failed", error, {
      requestId: c.get("requestId"),
    });
    return c.text("Could not load cart. Check database connection.", 503);
  }

  if (items.length === 0) {
    return c.redirect("/cart?msg=Your cart is empty.", 303);
  }

  const unavailable = items.filter((item) => !item.active);
  if (unavailable.length) {
    return c.redirect(
      "/cart?msg=One or more items are unavailable. Please remove them.",
      303,
    );
  }

  const stripe = getStripeClient();

  const order = await orderRepository.create({
    userId: authUser?.id ?? null,
    cartId,
    amountCents: subtotalCents,
    currency,
    status: OrderStatus.PENDING,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      priceCents: item.priceCents,
      currency: item.currency,
      productName: item.name,
    })),
  });
  await auditLogRepository.create({
    actorId: authUser?.id ?? null,
    actorRole: authUser?.role ?? null,
    action: "order.status",
    targetType: "order",
    targetId: order.id,
    metadata: {
      from: null,
      to: OrderStatus.PENDING,
      source: "checkout",
    },
  });

  const origin = requestOrigin(c);
  const successUrl = `${origin}/checkout/success?orderId=${order.id}`;
  const cancelUrl = `${origin}/checkout/cancel?orderId=${order.id}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: order.id,
    metadata: { orderId: order.id, cartId },
    payment_intent_data: { metadata: { orderId: order.id, cartId } },
    line_items: items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: item.currency,
        unit_amount: item.priceCents,
        product_data: {
          name: item.name,
          description: item.description ?? undefined,
        },
      },
    })),
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (session.id) {
    await orderRepository.setStripeSessionId(order.id, session.id);
  }

  return c.redirect(session.url ?? cancelUrl, 303);
});

app.get("/checkout/success", (c: Context) => {
  const orderId = c.req.query("orderId");
  return c.render(
    <CheckoutResultPage
      title="Payment received"
      body={`Thanks for your purchase. Order ${orderId ?? ""} is confirmed.`}
    />,
    { title: "Checkout success · Hono Shop" },
  );
});

app.get("/checkout/cancel", (c: Context) => {
  const orderId = c.req.query("orderId");
  return c.render(
    <CheckoutResultPage
      title="Checkout canceled"
      body={`Order ${
        orderId ?? ""
      } was not completed. You can retry from your cart.`}
    />,
    { title: "Checkout canceled · Hono Shop" },
  );
});

app.post("/webhooks/stripe", async (c: Context) => {
  if (!stripeConfig.webhookSecret || !stripeEnabled) {
    return c.text("Stripe webhook not configured", 501);
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) return c.text("Missing signature", 400);

  const rawBody = new TextDecoder().decode(await c.req.arrayBuffer());
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      stripeConfig.webhookSecret,
    );
  } catch (err) {
    logError("stripe.webhook.signature_failed", err, {
      requestId: c.get("requestId"),
    });
    return c.text("Invalid signature", 400);
  }

  try {
    logInfo("stripe.webhook.received", {
      requestId: c.get("requestId"),
      type: event.type,
      id: event.id,
    });
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const sessionId = session.id;
        const orderId = session.client_reference_id ??
          session.metadata?.orderId ??
          null;
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

        const order = sessionId
          ? await orderRepository.findByStripeSessionId(sessionId)
          : orderId
          ? await orderRepository.findById(orderId)
          : null;

        if (order) {
          logInfo("stripe.webhook.checkout_completed", {
            requestId: c.get("requestId"),
            orderId: order.id,
            sessionId,
          });
          if (order.status !== OrderStatus.PAID) {
            await orderRepository.updateStripeState(order.id, {
              status: OrderStatus.PAID,
              stripePaymentIntentId: paymentIntentId,
            });
            await auditLogRepository.create({
              actorId: null,
              actorRole: "SYSTEM",
              action: "order.status",
              targetType: "order",
              targetId: order.id,
              metadata: {
                from: order.status,
                to: OrderStatus.PAID,
                source: "stripe",
              },
            });
          }
          if (order.cartId) {
            await cartRepository.clear(order.cartId);
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.orderId;
        if (orderId) {
          const order = await orderRepository.findById(orderId);
          if (order && order.status !== OrderStatus.CANCELLED) {
            logInfo("stripe.webhook.payment_failed", {
              requestId: c.get("requestId"),
              orderId,
              paymentIntentId: pi.id,
            });
            await orderRepository.updateStripeState(orderId, {
              status: OrderStatus.CANCELLED,
              stripePaymentIntentId: pi.id,
            });
            await auditLogRepository.create({
              actorId: null,
              actorRole: "SYSTEM",
              action: "order.status",
              targetType: "order",
              targetId: order.id,
              metadata: {
                from: order.status,
                to: OrderStatus.CANCELLED,
                source: "stripe",
              },
            });
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    logError("stripe.webhook.handler_failed", err, {
      requestId: c.get("requestId"),
    });
    return c.text("Webhook handling failed", 500);
  }

  return c.text("ok", 200);
});

app.get("/about", (c: Context) =>
  c.render(
    <SimplePage title="About">
      <p>
        Hono Shop is a minimal, SSR-only e-commerce starter built with Deno +
        Hono and styled with Tailwind + daisyUI. The goal is boring, fast, and
        easy to extend.
      </p>
      <p>
        This repo is intentionally simple: server-rendered pages, signed cookies
        for auth, and a Postgres database (Neon) for users/products/orders.
      </p>
    </SimplePage>,
    { title: "About · Hono Shop" },
  ));

app.get("/contact", (c: Context) =>
  c.render(
    <SimplePage title="Contact">
      <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-3">
        <p class="text-sm text-base-content/70">
          Demo project: hook this up to your email provider or support inbox
          later.
        </p>
        <ul class="space-y-1 text-sm">
          <li>
            <span class="font-semibold">Email:</span> support@example.com
          </li>
          <li>
            <span class="font-semibold">Hours:</span> Mon–Fri, 9am–5pm
          </li>
        </ul>
      </div>
    </SimplePage>,
    { title: "Contact · Hono Shop" },
  ));

app.get("/terms", (c: Context) =>
  c.render(
    <SimplePage title="Terms">
      <p class="text-sm text-base-content/70">
        Placeholder terms page. Replace with your real policy before shipping.
      </p>
      <ul class="list-disc pl-5 space-y-1 text-sm">
        <li>All orders are subject to availability.</li>
        <li>Prices and promotions may change without notice.</li>
        <li>Returns accepted within 45 days in unused condition.</li>
      </ul>
    </SimplePage>,
    { title: "Terms · Hono Shop" },
  ));

app.get("/privacy", (c: Context) =>
  c.render(
    <SimplePage title="Privacy">
      <p class="text-sm text-base-content/70">
        Placeholder privacy policy. Replace with your real policy before
        shipping.
      </p>
      <ul class="list-disc pl-5 space-y-1 text-sm">
        <li>We only collect data required to fulfill orders.</li>
        <li>We do not sell personal information.</li>
        <li>Cookies are used for authentication and basic preferences.</li>
      </ul>
    </SimplePage>,
    { title: "Privacy · Hono Shop" },
  ));

const normalizeOptional = (value: string | undefined): string =>
  value?.toString().trim() ?? "";

const toOptionalValue = (value: string | undefined): string | null => {
  const trimmed = value?.toString().trim();
  return trimmed ? trimmed : null;
};

const normalizeAddressType = (value: string | undefined) => {
  const upper = value?.toString().trim().toUpperCase();
  if (upper === "SHIPPING" || upper === "BILLING") return upper;
  return null;
};

const emptyAddressValues = (): AddressFormValues => ({
  type: "SHIPPING",
  label: "",
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  phone: "",
  isDefault: false,
});

const addressValuesFromRow = (address: AccountAddress): AddressFormValues => ({
  type: address.type ?? "SHIPPING",
  label: address.label ?? "",
  name: address.name ?? "",
  line1: address.line1 ?? "",
  line2: address.line2 ?? "",
  city: address.city ?? "",
  region: address.region ?? "",
  postalCode: address.postalCode ?? "",
  country: address.country ?? "",
  phone: address.phone ?? "",
  isDefault: address.isDefault ?? false,
});

const addressValuesFromForm = (
  form: Record<string, string>,
): AddressFormValues => ({
  type: normalizeAddressType(form.type) ?? "SHIPPING",
  label: normalizeOptional(form.label),
  name: normalizeOptional(form.name),
  line1: normalizeOptional(form.line1),
  line2: normalizeOptional(form.line2),
  city: normalizeOptional(form.city),
  region: normalizeOptional(form.region),
  postalCode: normalizeOptional(form.postalCode),
  country: normalizeOptional(form.country),
  phone: normalizeOptional(form.phone),
  isDefault: form.isDefault === "on" || form.isDefault === "1",
});

const parseAddressForm = (form: Record<string, string>) => {
  const type = normalizeAddressType(form.type);
  const name = parseString(form.name, "Full name", { minLength: 2 });
  const line1 = parseString(form.line1, "Address line 1", { minLength: 3 });
  const city = parseString(form.city, "City", { minLength: 2 });
  const country = parseString(form.country, "Country", { minLength: 2 });
  const errors = collectErrors([name, line1, city, country]);
  if (!type) errors.push("Address type is invalid.");
  if (errors.length) {
    return { ok: false as const, error: errors.join(" ") };
  }
  return {
    ok: true as const,
    value: {
      type,
      label: toOptionalValue(form.label),
      name: name.value,
      line1: line1.value,
      line2: toOptionalValue(form.line2),
      city: city.value,
      region: toOptionalValue(form.region),
      postalCode: toOptionalValue(form.postalCode),
      country: country.value,
      phone: toOptionalValue(form.phone),
      isDefault: form.isDefault === "on" || form.isDefault === "1",
    },
  };
};

app.get(
  "/account/orders",
  requireUser(),
  (c: Context) => c.redirect("/account"),
);

app.get("/account", requireUser(), async (c: Context) => {
  const authUser = c.get("user") as AuthUser;
  const [user, orders, addresses] = await Promise.all([
    userRepository.findActiveById(authUser.id),
    orderRepository.listByUser(authUser.id),
    addressRepository.listByUser(authUser.id),
  ]);
  const notice = c.req.query("notice") ?? undefined;
  const error = c.req.query("error") ?? undefined;
  const csrfToken = ensureCsrfToken(c);

  return c.render(
    <AccountPage
      user={{ name: user?.name, email: user?.email, role: authUser.role }}
      orders={orders}
      addresses={addresses}
      notice={notice}
      error={error}
      csrfToken={csrfToken}
    />,
    { title: "Account · Hono Shop" },
  );
});

app.post("/account/profile", requireUser(), async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  if (!validateCsrf(c, form._csrf)) {
    return c.redirect("/account?error=Session%20expired.", 303);
  }

  const authUser = c.get("user") as AuthUser;
  const nameValue = normalizeOptional(form.name);
  const email = parseEmail(form.email);
  const errors = collectErrors([email]);
  if (nameValue && nameValue.length < 2) {
    errors.push("Name must be at least 2 characters.");
  }
  if (errors.length) {
    return c.redirect(
      `/account?error=${encodeURIComponent(errors.join(" "))}`,
      303,
    );
  }
  if (!email.ok) {
    return c.redirect("/account?error=Invalid%20email.", 303);
  }

  try {
    const existing = await userRepository.findByEmailAny(email.value);
    if (existing && existing.id !== authUser.id) {
      return c.redirect(
        "/account?error=That%20email%20is%20already%20in%20use.",
        303,
      );
    }
    await userRepository.updateProfile(authUser.id, {
      email: email.value,
      name: nameValue ? nameValue : null,
    });
    return c.redirect("/account?notice=Profile%20updated.", 303);
  } catch (error) {
    logError("account.profile.update_failed", error, {
      requestId: c.get("requestId"),
    });
    return c.redirect(
      "/account?error=Could%20not%20update%20profile.",
      303,
    );
  }
});

app.post("/account/password", requireUser(), async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  if (!validateCsrf(c, form._csrf)) {
    return c.redirect("/account?error=Session%20expired.", 303);
  }

  const currentPassword = form.currentPassword?.toString() ?? "";
  const newPassword = form.newPassword?.toString() ?? "";
  const confirmPassword = form.confirmPassword?.toString() ?? "";

  if (!newPassword || !confirmPassword) {
    return c.redirect("/account?error=Enter%20a%20new%20password.", 303);
  }

  if (newPassword !== confirmPassword) {
    return c.redirect("/account?error=Passwords%20do%20not%20match.", 303);
  }

  const validatedPassword = parseString(newPassword, "Password", {
    minLength: 8,
  });
  if (!validatedPassword.ok) {
    return c.redirect(
      `/account?error=${encodeURIComponent(validatedPassword.error)}`,
      303,
    );
  }

  try {
    const authUser = c.get("user") as AuthUser;
    const user = await userRepository.findActiveById(authUser.id);
    if (!user || !user.passwordHash) {
      return c.redirect("/account?error=Password%20not%20set.", 303);
    }
    const validCurrent = await verifyPassword(
      currentPassword,
      user.passwordHash,
    );
    if (!validCurrent) {
      return c.redirect(
        "/account?error=Current%20password%20is%20incorrect.",
        303,
      );
    }
    const passwordHash = await hashPassword(validatedPassword.value);
    await userRepository.updatePassword(authUser.id, passwordHash);
    return c.redirect("/account?notice=Password%20updated.", 303);
  } catch (error) {
    logError("account.password.update_failed", error, {
      requestId: c.get("requestId"),
    });
    return c.redirect(
      "/account?error=Could%20not%20update%20password.",
      303,
    );
  }
});

app.get("/account/addresses/new", requireUser(), (c: Context) => {
  const csrfToken = ensureCsrfToken(c);
  return c.render(
    <AddressFormPage
      title="Add address"
      action="/account/addresses"
      values={emptyAddressValues()}
      csrfToken={csrfToken}
    />,
    { title: "Add address · Hono Shop" },
  );
});

app.get("/account/addresses/:id/edit", requireUser(), async (c: Context) => {
  const authUser = c.get("user") as AuthUser;
  const address = await addressRepository.findById(
    authUser.id,
    c.req.param("id"),
  );
  if (!address) return c.notFound();
  const csrfToken = ensureCsrfToken(c);
  return c.render(
    <AddressFormPage
      title="Edit address"
      action={`/account/addresses/${address.id}`}
      values={addressValuesFromRow(address)}
      csrfToken={csrfToken}
    />,
    { title: "Edit address · Hono Shop" },
  );
});

app.post("/account/addresses", requireUser(), async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  const csrfToken = ensureCsrfToken(c);
  if (!validateCsrf(c, form._csrf)) {
    return c.redirect("/account?error=Session%20expired.", 303);
  }

  const parsed = parseAddressForm(form);
  if (!parsed.ok) {
    return c.render(
      <AddressFormPage
        title="Add address"
        action="/account/addresses"
        values={addressValuesFromForm(form)}
        error={parsed.error}
        csrfToken={csrfToken}
      />,
      { title: "Add address · Hono Shop" },
    );
  }

  try {
    const authUser = c.get("user") as AuthUser;
    await addressRepository.create(authUser.id, parsed.value);
    return c.redirect("/account?notice=Address%20saved.", 303);
  } catch (error) {
    logError("account.address.create_failed", error, {
      requestId: c.get("requestId"),
    });
    return c.render(
      <AddressFormPage
        title="Add address"
        action="/account/addresses"
        values={addressValuesFromForm(form)}
        error="Could not save address."
        csrfToken={csrfToken}
      />,
      { title: "Add address · Hono Shop" },
    );
  }
});

app.post("/account/addresses/:id", requireUser(), async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  const csrfToken = ensureCsrfToken(c);
  if (!validateCsrf(c, form._csrf)) {
    return c.redirect("/account?error=Session%20expired.", 303);
  }

  const parsed = parseAddressForm(form);
  if (!parsed.ok) {
    return c.render(
      <AddressFormPage
        title="Edit address"
        action={`/account/addresses/${c.req.param("id")}`}
        values={addressValuesFromForm(form)}
        error={parsed.error}
        csrfToken={csrfToken}
      />,
      { title: "Edit address · Hono Shop" },
    );
  }

  try {
    const authUser = c.get("user") as AuthUser;
    const updated = await addressRepository.update(
      authUser.id,
      c.req.param("id"),
      parsed.value,
    );
    if (!updated) return c.notFound();
    return c.redirect("/account?notice=Address%20updated.", 303);
  } catch (error) {
    logError("account.address.update_failed", error, {
      requestId: c.get("requestId"),
    });
    return c.render(
      <AddressFormPage
        title="Edit address"
        action={`/account/addresses/${c.req.param("id")}`}
        values={addressValuesFromForm(form)}
        error="Could not update address."
        csrfToken={csrfToken}
      />,
      { title: "Edit address · Hono Shop" },
    );
  }
});

app.post("/account/addresses/:id/delete", requireUser(), async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  if (!validateCsrf(c, form._csrf)) {
    return c.redirect("/account?error=Session%20expired.", 303);
  }
  try {
    const authUser = c.get("user") as AuthUser;
    await addressRepository.remove(authUser.id, c.req.param("id"));
    return c.redirect("/account?notice=Address%20removed.", 303);
  } catch (error) {
    logError("account.address.delete_failed", error, {
      requestId: c.get("requestId"),
    });
    return c.redirect("/account?error=Could%20not%20remove%20address.", 303);
  }
});

app.post(
  "/account/addresses/:id/default",
  requireUser(),
  async (c: Context) => {
    const form = await c.req.parseBody() as Record<string, string>;
    if (!validateCsrf(c, form._csrf)) {
      return c.redirect("/account?error=Session%20expired.", 303);
    }
    try {
      const authUser = c.get("user") as AuthUser;
      const updated = await addressRepository.setDefault(
        authUser.id,
        c.req.param("id"),
      );
      if (!updated) return c.notFound();
      return c.redirect("/account?notice=Default%20updated.", 303);
    } catch (error) {
      logError("account.address.default_failed", error, {
        requestId: c.get("requestId"),
      });
      return c.redirect(
        "/account?error=Could%20not%20update%20default.",
        303,
      );
    }
  },
);

app.get("/account/orders/:id", requireUser(), async (c: Context) => {
  const authUser = c.get("user") as AuthUser;
  const orderId = c.req.param("id");
  const [order, items, history] = await Promise.all([
    orderRepository.findById(orderId),
    orderItemRepository.listByOrderId(orderId),
    auditLogRepository.listByTarget("order", orderId),
  ]);
  if (!order || order.userId !== authUser.id) {
    return c.notFound();
  }
  return c.render(
    <OrderDetailPage order={order} items={items} history={history} />,
    { title: `Order ${order.id.slice(0, 8)} · Hono Shop` },
  );
});

app.get("/admin", requireRole([Role.ADMIN]), (c: Context) =>
  c.render(
    <PageShell>
      <main class="space-y-6">
        <div class="space-y-2">
          <p class="text-xs uppercase tracking-[0.18em] text-primary">Admin</p>
          <h1 class="text-3xl font-bold">Admin dashboard</h1>
          <p class="text-sm text-base-content/70">
            Quick links for orders and products. Staff can manage orders; admin
            can view products.
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-2">
            <h2 class="text-lg font-semibold">Orders</h2>
            <p class="text-sm text-base-content/70">
              View and update order status (paid/shipped/cancelled).
            </p>
            <a href="/admin/orders" class="btn btn-primary btn-sm">
              Manage orders
            </a>
          </div>
          <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-2">
            <h2 class="text-lg font-semibold">Products</h2>
            <p class="text-sm text-base-content/70">
              Create, edit, and archive products in the catalog.
            </p>
            <a href="/admin/products" class="btn btn-outline btn-sm">
              View products
            </a>
          </div>
          <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-2">
            <h2 class="text-lg font-semibold">Users</h2>
            <p class="text-sm text-base-content/70">
              Manage roles and access for customers and staff.
            </p>
            <a href="/admin/users" class="btn btn-outline btn-sm">
              View users
            </a>
          </div>
          <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-2">
            <h2 class="text-lg font-semibold">Audit log</h2>
            <p class="text-sm text-base-content/70">
              Track admin actions and order status changes.
            </p>
            <a href="/admin/audit" class="btn btn-outline btn-sm">
              View log
            </a>
          </div>
        </div>
      </main>
    </PageShell>,
  ));

app.get(
  "/admin/orders",
  requireRole([Role.ADMIN, Role.STAFF]),
  async (c: Context) => {
    const orders = await orderRepository.listAll(100);
    const csrfToken = ensureCsrfToken(c);
    return c.render(<AdminOrdersPage orders={orders} csrfToken={csrfToken} />, {
      title: "Admin · Orders",
    });
  },
);

app.get(
  "/admin/orders/:id",
  requireRole([Role.ADMIN, Role.STAFF]),
  async (c: Context) => {
    const orderId = c.req.param("id");
    const [order, items, history] = await Promise.all([
      orderRepository.findById(orderId),
      orderItemRepository.listByOrderId(orderId),
      auditLogRepository.listByTarget("order", orderId),
    ]);
    if (!order) return c.notFound();
    const user = order.userId
      ? await userRepository.findByIdAny(order.userId)
      : null;
    const csrfToken = ensureCsrfToken(c);
    return c.render(
      <AdminOrderDetailPage
        order={order}
        items={items}
        history={history}
        userEmail={user?.email ?? null}
        csrfToken={csrfToken}
      />,
      { title: `Admin · Order ${order.id.slice(0, 8)}` },
    );
  },
);

app.post(
  "/admin/orders/status",
  requireRole([Role.ADMIN, Role.STAFF]),
  async (c: Context) => {
    const form = await c.req.parseBody() as Record<string, string>;
    if (!validateCsrf(c, form._csrf)) {
      return c.text("Invalid CSRF token", 400);
    }
    const orderId = form.orderId?.toString();
    const status = form.status?.toString() as OrderStatus | undefined;
    if (!orderId || !status) return c.text("Missing order id or status", 400);

    if (
      ![
        OrderStatus.PAID,
        OrderStatus.SHIPPED,
        OrderStatus.REFUNDED,
        OrderStatus.CANCELLED,
      ].includes(status)
    ) {
      return c.text("Invalid status", 400);
    }

    const existing = await orderRepository.findById(orderId);
    if (!existing) return c.text("Order not found", 404);

    if (existing.status !== status) {
      await orderRepository.updateStatus(orderId, status);
      const authUser = c.get("user") as AuthUser | undefined;
      await auditLogRepository.create({
        actorId: authUser?.id ?? null,
        actorRole: authUser?.role ?? null,
        action: "order.status",
        targetType: "order",
        targetId: orderId,
        metadata: {
          from: existing.status,
          to: status,
          source: "admin",
        },
      });
    }

    return c.redirect(`/admin/orders/${orderId}`, 303);
  },
);

app.get("/admin/products", requireRole([Role.ADMIN]), async (c: Context) => {
  const products = await productRepository.listAll({ limit: 200, offset: 0 });
  const csrfToken = ensureCsrfToken(c);
  const notice = c.req.query("notice") ?? undefined;
  return c.render(
    <AdminProductsPage
      products={products}
      csrfToken={csrfToken}
      notice={notice}
    />,
    {
      title: "Admin · Products",
    },
  );
});

app.get("/admin/products/new", requireRole([Role.ADMIN]), (c: Context) => {
  const csrfToken = ensureCsrfToken(c);
  return c.render(
    <AdminProductFormPage
      title="New product"
      action="/admin/products"
      values={{
        name: "",
        slug: "",
        category: "",
        sku: "",
        stock: "",
        price: "",
        currency: "USD",
        description: "",
        images: "",
        active: true,
      }}
      csrfToken={csrfToken}
    />,
    { title: "New product · Hono Shop" },
  );
});

app.get(
  "/admin/products/:id/edit",
  requireRole([Role.ADMIN]),
  async (c: Context) => {
    const product = await productRepository.findByIdAdmin(c.req.param("id"));
    if (!product) return c.notFound();
    const csrfToken = ensureCsrfToken(c);
    return c.render(
      <AdminProductFormPage
        title={`Edit ${product.name}`}
        action={`/admin/products/${product.id}`}
        values={productFormValuesFromRow(product)}
        csrfToken={csrfToken}
      />,
      { title: `Edit ${product.name} · Hono Shop` },
    );
  },
);

app.post("/admin/products", requireRole([Role.ADMIN]), async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  const csrfToken = ensureCsrfToken(c);
  if (!validateCsrf(c, form._csrf)) {
    return c.render(
      <AdminProductFormPage
        title="New product"
        action="/admin/products"
        values={productFormValuesFromForm(form)}
        error="Session expired. Please try again."
        csrfToken={csrfToken}
      />,
      { title: "New product · Hono Shop" },
    );
  }

  const parsed = parseProductForm(form);
  if (!parsed.ok) {
    return c.render(
      <AdminProductFormPage
        title="New product"
        action="/admin/products"
        values={productFormValuesFromForm(form)}
        error={parsed.error}
        csrfToken={csrfToken}
      />,
      { title: "New product · Hono Shop" },
    );
  }

  try {
    const existing = await productRepository.findBySlugAny(parsed.value.slug);
    if (existing) {
      return c.render(
        <AdminProductFormPage
          title="New product"
          action="/admin/products"
          values={productFormValuesFromForm(form)}
          error="That slug is already in use."
          csrfToken={csrfToken}
        />,
        { title: "New product · Hono Shop" },
      );
    }
    await productRepository.create(parsed.value);
    return c.redirect("/admin/products?notice=Product%20created.", 303);
  } catch (error) {
    logError("admin.product.create_failed", error, {
      requestId: c.get("requestId"),
    });
    return c.render(
      <AdminProductFormPage
        title="New product"
        action="/admin/products"
        values={productFormValuesFromForm(form)}
        error="Could not create product."
        csrfToken={csrfToken}
      />,
      { title: "New product · Hono Shop" },
    );
  }
});

app.post(
  "/admin/products/:id",
  requireRole([Role.ADMIN]),
  async (c: Context) => {
    const form = await c.req.parseBody() as Record<string, string>;
    const csrfToken = ensureCsrfToken(c);
    if (!validateCsrf(c, form._csrf)) {
      return c.render(
        <AdminProductFormPage
          title="Edit product"
          action={`/admin/products/${c.req.param("id")}`}
          values={productFormValuesFromForm(form)}
          error="Session expired. Please try again."
          csrfToken={csrfToken}
        />,
        { title: "Edit product · Hono Shop" },
      );
    }

    const parsed = parseProductForm(form);
    if (!parsed.ok) {
      return c.render(
        <AdminProductFormPage
          title="Edit product"
          action={`/admin/products/${c.req.param("id")}`}
          values={productFormValuesFromForm(form)}
          error={parsed.error}
          csrfToken={csrfToken}
        />,
        { title: "Edit product · Hono Shop" },
      );
    }

    try {
      const existing = await productRepository.findBySlugAny(parsed.value.slug);
      if (existing && existing.id !== c.req.param("id")) {
        return c.render(
          <AdminProductFormPage
            title="Edit product"
            action={`/admin/products/${c.req.param("id")}`}
            values={productFormValuesFromForm(form)}
            error="That slug is already in use."
            csrfToken={csrfToken}
          />,
          { title: "Edit product · Hono Shop" },
        );
      }

      const updated = await productRepository.update(
        c.req.param("id"),
        parsed.value,
      );
      if (!updated) return c.notFound();
      return c.redirect("/admin/products?notice=Product%20updated.", 303);
    } catch (error) {
      logError("admin.product.update_failed", error, {
        requestId: c.get("requestId"),
        productId: c.req.param("id"),
      });
      return c.render(
        <AdminProductFormPage
          title="Edit product"
          action={`/admin/products/${c.req.param("id")}`}
          values={productFormValuesFromForm(form)}
          error="Could not update product."
          csrfToken={csrfToken}
        />,
        { title: "Edit product · Hono Shop" },
      );
    }
  },
);

app.post(
  "/admin/products/:id/status",
  requireRole([Role.ADMIN]),
  async (c: Context) => {
    const form = await c.req.parseBody() as Record<string, string>;
    if (!validateCsrf(c, form._csrf)) {
      return c.redirect("/admin/products?notice=Session%20expired.", 303);
    }
    const active = form.active?.toString() === "true";
    try {
      await productRepository.setActive(c.req.param("id"), active);
      return c.redirect(
        `/admin/products?notice=Product%20${
          active ? "activated" : "archived"
        }.`,
        303,
      );
    } catch (error) {
      logError("admin.product.status_failed", error, {
        requestId: c.get("requestId"),
        productId: c.req.param("id"),
      });
      return c.redirect(
        "/admin/products?notice=Could%20not%20update%20product.",
        303,
      );
    }
  },
);

app.get("/admin/users", requireRole([Role.ADMIN]), async (c: Context) => {
  const users = await userRepository.listAll(200);
  const csrfToken = ensureCsrfToken(c);
  const notice = c.req.query("notice") ?? undefined;
  return c.render(
    <AdminUsersPage users={users} csrfToken={csrfToken} notice={notice} />,
    {
      title: "Admin · Users",
    },
  );
});

app.post(
  "/admin/users/:id/role",
  requireRole([Role.ADMIN]),
  async (c: Context) => {
    const form = await c.req.parseBody() as Record<string, string>;
    if (!validateCsrf(c, form._csrf)) {
      return c.text("Invalid CSRF token", 400);
    }
    const role = form.role?.toString() as Role | undefined;
    if (!role || ![Role.CUSTOMER, Role.STAFF, Role.ADMIN].includes(role)) {
      return c.text("Invalid role", 400);
    }
    const userId = c.req.param("id");
    const existing = await userRepository.findByIdAny(userId);
    if (!existing) return c.text("User not found", 404);
    if (existing.role !== role) {
      await userRepository.setRole(userId, role);
      const authUser = c.get("user") as AuthUser | undefined;
      await auditLogRepository.create({
        actorId: authUser?.id ?? null,
        actorRole: authUser?.role ?? null,
        action: "user.role",
        targetType: "user",
        targetId: userId,
        metadata: {
          from: existing.role,
          to: role,
        },
      });
    }
    return c.redirect("/admin/users?notice=Role%20updated.", 303);
  },
);

app.post(
  "/admin/users/:id/status",
  requireRole([Role.ADMIN]),
  async (c: Context) => {
    const form = await c.req.parseBody() as Record<string, string>;
    if (!validateCsrf(c, form._csrf)) {
      return c.text("Invalid CSRF token", 400);
    }
    const activeValue = form.active?.toString();
    if (activeValue !== "true" && activeValue !== "false") {
      return c.text("Invalid status", 400);
    }
    const userId = c.req.param("id");
    const existing = await userRepository.findByIdAny(userId);
    if (!existing) return c.text("User not found", 404);
    const isActive = activeValue === "true";
    if (existing.isActive !== isActive) {
      await userRepository.setActive(userId, isActive);
      const authUser = c.get("user") as AuthUser | undefined;
      await auditLogRepository.create({
        actorId: authUser?.id ?? null,
        actorRole: authUser?.role ?? null,
        action: "user.status",
        targetType: "user",
        targetId: userId,
        metadata: {
          from: existing.isActive ? "active" : "disabled",
          to: isActive ? "active" : "disabled",
        },
      });
    }
    return c.redirect("/admin/users?notice=Status%20updated.", 303);
  },
);

app.get("/admin/audit", requireRole([Role.ADMIN]), async (c: Context) => {
  const entries = await auditLogRepository.listRecent(200);
  return c.render(<AdminAuditPage entries={entries} />, {
    title: "Admin · Audit log",
  });
});

app.get("/health", async (c: Context) => {
  const dbCheck = c.req.query("db") === "1"
    ? await (async () => {
      try {
        const { getDb } = await import("./db/client.ts");
        const sql = await getDb();
        const rows = await sql<{ ok: number }>`select 1 as ok;`;
        return rows[0]?.ok === 1;
      } catch (error) {
        logError("health.db_check_failed", error, {
          requestId: c.get("requestId"),
        });
        return false;
      }
    })()
    : undefined;

  const snapshot = getMetricsSnapshot();

  return c.json({
    status: "ok",
    environment: server.environment,
    uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    db: dbCheck,
    metrics: {
      requests: snapshot.requests,
      avgDurationMs: snapshot.avgDurationMs,
      byStatus: snapshot.byStatus,
    },
  });
});

app.onError((error, c: Context) => {
  const requestId = c.get("requestId");
  logError("request.error", error, {
    requestId,
    path: c.req.path,
    method: c.req.method,
  });
  c.status(500);
  const accept = c.req.header("accept") ?? "";
  if (accept.includes("text/html")) {
    return c.render(<ServerErrorPage requestId={requestId} />, {
      title: "Server error · Hono Shop",
    });
  }
  return c.text("Internal Server Error", 500);
});

app.notFound((c: Context) => {
  c.status(404);
  return c.render(<NotFoundPage />, { title: "Not found · Hono Shop" });
});

const port = server.port;
const isDenoDeploy = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));

export { app };
export default app;
// Export a fetch handler for edge platforms (e.g., Deno Deploy) to avoid binding ports.
export const fetch = (request: Request) => app.fetch(request);

if (!isDenoDeploy && import.meta.main) {
  logInfo("server.listen", { port, url: `http://localhost:${port}` });
  Deno.serve({ port }, app.fetch);
}

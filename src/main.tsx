import { Hono } from "hono";
import type { Context } from "hono";
import type { Child } from "hono/jsx";
import { jsxRenderer, serveStatic } from "hono/middleware";
import { loadConfig } from "./config/env.ts";
import { authMiddleware, requireRole, requireUser } from "./middleware/auth.ts";
import { authRoutes } from "./routes/auth.tsx";
import { OrderStatus, Role } from "./types/domain.ts";
import {
  cartRepository,
  orderRepository,
  productRepository,
  userRepository,
} from "./db/repositories.ts";
import { getCookie, setCookie } from "hono/cookie";
import type { AuthUser } from "./middleware/auth.ts";
import Stripe from "stripe";

const startTime = Date.now();
const { server, stripe: stripeConfig } = loadConfig();
const app = new Hono();
const isProdLike = server.environment === "production" ||
  Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));
const cartCookieName = "cart_session";
const metrics = {
  requests: 0,
  totalDurationMs: 0,
};
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
  if (rateLimitPaths.some((p) => path.startsWith(p))) {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("cf-connecting-ip") ||
      "unknown";
    const key = `${ip}:${path}`;
    const result = rateLimit(key, 30, 60_000);
    if (!result.allowed) {
      return c.text("Too many requests. Try again shortly.", 429);
    }
  }
  await next();
});

app.use("*", async (c, next) => {
  const start = performance.now();
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  const duration = performance.now() - start;
  metrics.requests += 1;
  metrics.totalDurationMs += duration;
  const status = c.res.status;
  const method = c.req.method;
  const path = c.req.path;
  console.log(
    `[${requestId}] ${method} ${path} -> ${status} (${duration.toFixed(1)}ms)`,
  );
});

app.use("*", authMiddleware);
app.route("/auth", authRoutes);

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );

const ProductCard = ({ product }: { product: Product }) => (
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
        <button type="button" class="btn btn-sm btn-primary">Add to bag</button>
        <a href={`/products/${product.id}`} class="btn btn-sm btn-ghost">
          View details
        </a>
      </div>
    </div>
  </article>
);

const ProductHighlight = ({ product }: { product: Product }) => (
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
          <button type="button" class="btn btn-primary">Add to bag</button>
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

const ShopHomePage = () => {
  const [featured, ...rest] = products;

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
        <ProductHighlight product={featured} />
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
              <ProductCard product={product} key={product.id} />
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
  priceCents: Math.round(product.price * 100),
  currency: "USD",
  active: true,
  images: [product.image],
  createdAt: new Date().toISOString(),
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
  "form-action 'self'",
  "base-uri 'self'",
].join("; ");

const rateLimit = (key: string, limit: number, windowMs: number) => {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateLimitBuckets.set(key, { resetAt: now + windowMs, count: 1 });
    return { allowed: true, remaining: limit - 1 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryInMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count };
};

const rateLimitPaths = ["/auth/login", "/auth/register", "/webhooks/stripe"];

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

const DbProductCard = ({ product }: { product: DbProduct }) => (
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
        <button type="button" class="btn btn-sm btn-primary">
          Add to cart
        </button>
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
              <DbProductCard product={product} key={product.id} />
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

const ProductDetailPage = ({ product }: { product: DbProduct }) => (
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
            <button type="button" class="btn btn-primary">Add to cart</button>
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

type CartPageProps = {
  items: CartItem[];
  subtotalCents: number;
  currency: string;
  stripeEnabled: boolean;
  message?: string;
};

const CartPage = ({
  items,
  subtotalCents,
  currency,
  stripeEnabled,
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
};

const AccountPage = ({ user, orders }: AccountPageProps) => {
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

const OrderDetailPage = (
  { order }: { order: AccountOrder },
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
            Shipment and line items will be added in the next stages.
          </p>
        </div>
        <a href="/account" class="btn btn-ghost btn-sm">Back to account</a>
      </div>
    </main>
  </PageShell>
);

type AdminOrdersPageProps = {
  orders: AdminOrder[];
};

const AdminOrdersPage = ({ orders }: AdminOrdersPageProps) => (
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
                <td>{order.id.slice(0, 8)}</td>
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
                      OrderStatus.CANCELLED,
                    ].map((status) => (
                      <form
                        method="POST"
                        action="/admin/orders/status"
                        key={`${order.id}-${status}`}
                      >
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

type AdminProductsPageProps = { products: DbProduct[] };

const AdminProductsPage = ({ products }: AdminProductsPageProps) => (
  <PageShell>
    <main class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
            Admin
          </p>
          <h1 class="text-3xl font-bold">Products</h1>
        </div>
        <a href="/admin" class="btn btn-ghost btn-sm">Back to admin</a>
      </div>
      <div class="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Category</th>
              <th>Price</th>
              <th>Active</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{product.slug}</td>
                <td>{product.category ?? "—"}</td>
                <td>
                  {formatMoneyCents(product.priceCents, product.currency)}
                </td>
                <td>{product.active ? "Yes" : "No"}</td>
                <td>{formatDate(product.createdAt)}</td>
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

app.get("/", (c: Context) =>
  c.render(<ShopHomePage />, {
    title: "Hono Shop",
    description:
      "Modern essentials for work, travel, and home — built with Deno + Hono.",
  }));

app.get("/products", async (c: Context) => {
  const selectedCategory = (c.req.query("category") ?? "").trim();
  const query = (c.req.query("q") ?? "").trim();
  const pageSize = 12;
  let page = parsePositiveInt(c.req.query("page"), 1);

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
    console.error("Failed to load products from database:", error);
  }

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

  try {
    const product = await productRepository.findBySlug(slug);
    if (product) {
      return c.render(<ProductDetailPage product={product} />, {
        title: `${product.name} · Hono Shop`,
        description: product.description ?? `Buy ${product.name} on Hono Shop.`,
      });
    }
  } catch (error) {
    console.error("Failed to load product detail from database:", error);
  }

  const fallback = demoCatalog.find((product) => product.slug === slug);
  if (fallback) {
    return c.render(<ProductDetailPage product={fallback} />, {
      title: `${fallback.name} · Hono Shop`,
      description: fallback.description ?? `Buy ${fallback.name} on Hono Shop.`,
    });
  }

  return c.notFound();
});

const parseQuantity = (value: unknown, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  return floored > 0 ? floored : fallback;
};

app.get("/cart", async (c: Context) => {
  let items: CartItem[] = [];
  let subtotalCents = 0;
  let currency = "USD";
  let message = c.req.query("msg") ?? undefined;

  try {
    const cart = await loadCart(c);
    items = cart.items;
    subtotalCents = cart.subtotalCents;
    currency = cart.currency;
  } catch (error) {
    console.error("Failed to load cart:", error);
    message = "Could not load cart. Check database connection.";
  }

  return c.render(
    <CartPage
      items={items}
      subtotalCents={subtotalCents}
      currency={currency}
      stripeEnabled={stripeEnabled}
      message={message}
    />,
    { title: "Cart · Hono Shop" },
  );
});

app.post("/cart/add", async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  const productId = form.productId?.toString();
  const quantity = parseQuantity(form.quantity, 1);
  if (!productId) return c.text("Missing product", 400);

  try {
    const product = await productRepository.findById(productId);
    if (!product) return c.text("Product not found", 404);

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
    console.error("Failed to add to cart:", error);
    return c.text("Could not add to cart. Check database connection.", 503);
  }

  const returnTo = form.returnTo || c.req.header("referer") || "/cart";
  return c.redirect(returnTo.toString(), 303);
});

app.post("/cart/update", async (c: Context) => {
  const form = await c.req.parseBody() as Record<string, string>;
  const itemId = form.itemId?.toString();
  const quantity = parseQuantity(form.quantity, 0);
  if (!itemId) return c.text("Missing cart item", 400);

  try {
    const { cartId } = await loadCart(c);
    await cartRepository.updateQuantity(cartId, itemId, quantity);
  } catch (error) {
    console.error("Failed to update cart:", error);
    return c.text("Could not update cart. Check database connection.", 503);
  }
  return c.redirect("/cart", 303);
});

app.post("/cart/clear", async (c: Context) => {
  try {
    const { cartId } = await loadCart(c);
    await cartRepository.clear(cartId);
  } catch (error) {
    console.error("Failed to clear cart:", error);
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
    console.error("Failed to load cart for checkout:", error);
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
    console.error("Stripe webhook signature verification failed:", err);
    return c.text("Invalid signature", 400);
  }

  try {
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
          await orderRepository.updateStripeState(order.id, {
            status: OrderStatus.PAID,
            stripePaymentIntentId: paymentIntentId,
          });
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
          await orderRepository.updateStripeState(orderId, {
            status: OrderStatus.CANCELLED,
            stripePaymentIntentId: pi.id,
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Error handling Stripe webhook:", err);
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

app.get("/account", requireUser(), (c: Context) => c.notFound());

app.get(
  "/account/orders",
  requireUser(),
  (c: Context) => c.redirect("/account"),
);

app.get("/account", requireUser(), async (c: Context) => {
  const authUser = c.get("user") as AuthUser;
  const [user, orders] = await Promise.all([
    userRepository.findActiveById(authUser.id),
    orderRepository.listByUser(authUser.id),
  ]);

  return c.render(
    <AccountPage
      user={{ name: user?.name, email: user?.email, role: authUser.role }}
      orders={orders}
    />,
    { title: "Account · Hono Shop" },
  );
});

app.get("/account/orders/:id", requireUser(), async (c: Context) => {
  const authUser = c.get("user") as AuthUser;
  const order = await orderRepository.findById(c.req.param("id"));
  if (!order || order.userId !== authUser.id) {
    return c.notFound();
  }
  return c.render(
    <OrderDetailPage order={order} />,
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
        <div class="grid gap-4 sm:grid-cols-2">
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
              View product catalog. Editing/CRUD will be added later.
            </p>
            <a href="/admin/products" class="btn btn-outline btn-sm">
              View products
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
    return c.render(<AdminOrdersPage orders={orders} />, {
      title: "Admin · Orders",
    });
  },
);

app.post(
  "/admin/orders/status",
  requireRole([Role.ADMIN, Role.STAFF]),
  async (c: Context) => {
    const form = await c.req.parseBody() as Record<string, string>;
    const orderId = form.orderId?.toString();
    const status = form.status?.toString() as OrderStatus | undefined;
    if (!orderId || !status) return c.text("Missing order id or status", 400);

    if (
      ![OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.CANCELLED].includes(
        status,
      )
    ) {
      return c.text("Invalid status", 400);
    }

    await orderRepository.updateStatus(orderId, status);
    return c.redirect("/admin/orders", 303);
  },
);

app.get("/admin/products", requireRole([Role.ADMIN]), async (c: Context) => {
  const products = await productRepository.listActive({
    limit: 200,
    offset: 0,
  });
  return c.render(<AdminProductsPage products={products} />, {
    title: "Admin · Products",
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
        console.error("Health DB check failed:", error);
        return false;
      }
    })()
    : undefined;

  return c.json({
    status: "ok",
    environment: server.environment,
    uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    db: dbCheck,
    metrics: {
      requests: metrics.requests,
      avgDurationMs: metrics.requests
        ? Number((metrics.totalDurationMs / metrics.requests).toFixed(2))
        : 0,
    },
  });
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
  console.log(`Listening on http://localhost:${port}`);
  Deno.serve({ port }, app.fetch);
}

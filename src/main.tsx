import { Hono } from "hono";
import type { Context } from "hono";
import type { Child } from "hono/jsx";
import { jsxRenderer, serveStatic } from "hono/middleware";
import { loadConfig } from "./config/env.ts";
import { authMiddleware, requireRole, requireUser } from "./middleware/auth.ts";
import { authRoutes } from "./routes/auth.tsx";
import { Role } from "./types/domain.ts";
import { productRepository } from "./db/repositories.ts";

const startTime = Date.now();
const app = new Hono();
const { server } = loadConfig();

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

const formatMoneyCents = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );

const getPrimaryImage = (images: string[] | null) =>
  images?.[0] ??
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80";

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

app.get("/cart", (c: Context) =>
  c.render(
    <SimplePage title="Cart">
      <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm space-y-4">
        <p class="text-sm text-base-content/70">
          Cart is not implemented yet. This will be built in the Stripe checkout
          stage.
        </p>
        <div class="flex flex-wrap gap-2">
          <a href="/products" class="btn btn-primary btn-sm">
            Continue shopping
          </a>
          <a href="/" class="btn btn-ghost btn-sm">Back home</a>
        </div>
      </div>
    </SimplePage>,
    { title: "Cart · Hono Shop" },
  ));

app.get("/account", requireUser(), (c: Context) =>
  c.render(
    <main class="mx-auto max-w-4xl px-4 py-10">
      <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
        <p class="text-xs uppercase tracking-[0.18em] text-primary">Account</p>
        <h1 class="text-3xl font-semibold">Account dashboard</h1>
        <p class="mt-2 text-base-content/70">
          Welcome back. Replace this placeholder with order history, profile
          details, and saved addresses.
        </p>
      </div>
    </main>,
  ));

app.get("/admin", requireRole([Role.ADMIN]), (c: Context) =>
  c.render(
    <main class="mx-auto max-w-4xl px-4 py-10">
      <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
        <p class="text-xs uppercase tracking-[0.18em] text-primary">Admin</p>
        <h1 class="text-3xl font-semibold">Admin dashboard</h1>
        <p class="mt-2 text-base-content/70">
          Admin-only area for managing products, orders, and users. Fill this in
          during the admin stage.
        </p>
      </div>
    </main>,
  ));

app.get("/health", (c: Context) =>
  c.json({
    status: "ok",
    environment: server.environment,
    uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  }));

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

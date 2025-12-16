import { Hono } from "hono";
import type { Context } from "hono";
import type { Child } from "hono/jsx";
import { jsxRenderer, serveStatic } from "hono/middleware";
import Prisma from "@prisma/client";
import { loadConfig } from "./config/env.ts";
import { authMiddleware, requireRole, requireUser } from "./middleware/auth.ts";
import { authRoutes } from "./routes/auth.tsx";

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
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1200&q=80",
    badge: "New",
    tags: ["Water-resistant", "13\" laptop"],
    rating: 4.8
  },
  {
    id: "everyday-sneaker",
    name: "Everyday Sneaker",
    category: "Footwear",
    price: 98,
    description: "Low-profile silhouette with recycled rubber sole.",
    image:
      "https://images.unsplash.com/photo-1514986888952-8cd320577b68?auto=format&fit=crop&w=1200&q=80",
    badge: "Bestseller",
    tags: ["Unisex", "Breathable"],
    rating: 4.7
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
    rating: 4.6
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
    rating: 4.9
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
    rating: 4.5
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
    rating: 4.7
  }
];

const categories = ["Bags", "Footwear", "Apparel", "Travel", "Workspace", "Home"];

type LayoutProps = {
  children?: Child;
  title?: string;
};

const Layout = ({ children, title = "Hono Shop" }: LayoutProps) => (
  <html data-theme="light">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
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
    value
  );

const ProductCard = ({ product }: { product: Product }) => (
  <article class="card h-full border border-base-300 bg-base-100 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">
    <figure class="relative aspect-[4/3] overflow-hidden bg-base-200">
      {product.badge && (
        <span class="badge badge-primary absolute left-3 top-3">{product.badge}</span>
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
          <p class="font-semibold text-base-content">{formatPrice(product.price)}</p>
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
            <span class="badge badge-ghost badge-sm" key={`${product.id}-${tag}`}>
              {tag}
            </span>
          ))}
        </div>
      )}
      <div class="card-actions justify-between pt-2">
        <button type="button" class="btn btn-sm btn-primary">Add to bag</button>
        <button type="button" class="btn btn-sm btn-ghost">View details</button>
      </div>
    </div>
  </article>
);

const ProductHighlight = ({ product }: { product: Product }) => (
  <section class="grid gap-6 overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm lg:grid-cols-2">
    <div class="relative">
      {product.badge && (
        <span class="badge badge-primary absolute left-4 top-4">{product.badge}</span>
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
        <h2 class="text-3xl font-semibold leading-tight">Everyday hero piece</h2>
        <p class="text-base leading-relaxed text-base-content/70">
          {product.description} Built for commutes, overnights, and everything in
          between. Pair it with our travel lineup for a cohesive kit.
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
          <button type="button" class="btn btn-ghost">View full details</button>
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
        <p class="text-sm font-semibold">Hono Shop</p>
        <p class="text-xs text-base-content/60">Daily essentials</p>
      </div>
    </div>
    <div class="hidden items-center gap-3 text-sm sm:flex">
      <button type="button" class="btn btn-ghost btn-sm">Catalog</button>
      <button type="button" class="btn btn-ghost btn-sm">Stories</button>
      <button type="button" class="btn btn-ghost btn-sm">Support</button>
    </div>
    <div class="flex items-center gap-2">
      <button type="button" class="btn btn-ghost btn-sm">Sign in</button>
      <button type="button" class="btn btn-primary btn-sm">Cart</button>
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
            Build a refined everyday kit with breathable layers, durable carry, and
            elevated home essentials.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <button type="button" class="btn btn-primary btn-lg">Shop arrivals</button>
          <button type="button" class="btn btn-outline btn-lg">Build your kit</button>
        </div>
        <div class="grid gap-4 text-sm sm:grid-cols-3">
          {[
            { label: "Free shipping", detail: "Orders over $75" },
            { label: "45-day returns", detail: "Easy exchanges" },
            { label: "Ethical sourcing", detail: "Low-impact materials" }
          ].map((item) => (
            <div key={item.label} class="rounded-xl border border-base-300 bg-base-100/60 p-3">
              <p class="font-semibold">{item.label}</p>
              <p class="text-base-content/70">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
      <div class="relative overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-lg">
        <img
          src="https://images.unsplash.com/photo-1462396881884-de2c07cb95ed?auto=format&fit=crop&w=1400&q=80"
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
      <button
        type="button"
        key={category}
        class="btn btn-sm rounded-full border-base-300 bg-base-100 text-sm"
      >
        {category}
      </button>
    ))}
  </section>
);

const Perks = () => (
  <section class="grid gap-4 rounded-box bg-base-100 p-6 shadow-sm sm:grid-cols-3">
    {[
      {
        title: "Thoughtful materials",
        copy: "Organic cotton, recycled rubber, and FSC-certified wood accents."
      },
      {
        title: "Flexible payments",
        copy: "Split your order at checkout with no added fees."
      },
      {
        title: "Dedicated support",
        copy: "Fit guidance, care tips, and styling help when you need it."
      }
    ].map((perk) => (
      <div key={perk.title} class="space-y-1">
        <p class="text-sm uppercase tracking-[0.18em] text-primary">{perk.title}</p>
        <p class="text-sm leading-relaxed text-base-content/70">{perk.copy}</p>
      </div>
    ))}
  </section>
);

const Footer = () => (
  <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-6 text-sm text-base-content/70">
    <p>© {new Date().getFullYear()} Hono Shop. Crafted for Deno + Hono.</p>
    <div class="flex gap-3">
      <a class="link link-hover" href="#">Privacy</a>
      <a class="link link-hover" href="#">Terms</a>
      <a class="link link-hover" href="#">Contact</a>
    </div>
  </footer>
);

const ShopHomePage = () => {
  const [featured, ...rest] = products;

  return (
    <main class="bg-base-200">
      <div class="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <Navbar />
        <div class="flex flex-col gap-10">
          <Hero />
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.18em] text-primary/80">
                  Curated categories
                </p>
                <h2 class="text-2xl font-semibold">Shop by interest</h2>
              </div>
              <button type="button" class="btn btn-ghost btn-sm">View all</button>
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
                <h2 class="text-2xl font-semibold">Fresh arrivals for the season</h2>
              </div>
              <button type="button" class="btn btn-outline btn-sm">Filter</button>
            </div>
            <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))}
            </div>
          </section>
          <Perks />
          <Footer />
        </div>
      </div>
    </main>
  );
};

app.get("/", (c: Context) => c.render(<ShopHomePage />));

app.get("/account", requireUser(), (c: Context) =>
  c.render(
    <main class="mx-auto max-w-4xl px-4 py-10">
      <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
        <p class="text-xs uppercase tracking-[0.18em] text-primary">Account</p>
        <h1 class="text-3xl font-semibold">Account dashboard</h1>
        <p class="mt-2 text-base-content/70">
          Welcome back. Replace this placeholder with order history, profile details, and saved
          addresses.
        </p>
      </div>
    </main>
  ));

const { Role } = Prisma;

app.get("/admin", requireRole([Role.ADMIN]), (c: Context) =>
  c.render(
    <main class="mx-auto max-w-4xl px-4 py-10">
      <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-sm">
        <p class="text-xs uppercase tracking-[0.18em] text-primary">Admin</p>
        <h1 class="text-3xl font-semibold">Admin dashboard</h1>
        <p class="mt-2 text-base-content/70">
          Admin-only area for managing products, orders, and users. Fill this in during the admin
          stage.
        </p>
      </div>
    </main>
  ));

app.get("/health", (c: Context) =>
  c.json({
    status: "ok",
    environment: server.environment,
    uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString()
  }),
);

const port = server.port;
const isDenoDeploy = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));

export { app };
// Export a fetch handler for edge platforms (e.g., Deno Deploy) to avoid binding ports.
export const fetch = (request: Request) => app.fetch(request);

if (!isDenoDeploy && import.meta.main) {
  console.log(`Listening on http://localhost:${port}`);
  Deno.serve({ port }, app.fetch);
}

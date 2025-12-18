import { getDb } from "../../src/db/client.ts";

const demoProducts = [
  {
    slug: "carryall-tote",
    name: "Carryall Tote",
    description: "Waxed canvas with leather trim and interior laptop sleeve.",
    category: "Bags",
    priceCents: 7200,
    currency: "USD",
    active: true,
    images: [
      "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    slug: "everyday-sneaker",
    name: "Everyday Sneaker",
    description: "Low-profile silhouette with recycled rubber sole.",
    category: "Footwear",
    priceCents: 9800,
    currency: "USD",
    active: true,
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    slug: "linen-shirt",
    name: "Linen Camp Shirt",
    description: "Airy linen blend with a relaxed drape for warmer days.",
    category: "Apparel",
    priceCents: 6400,
    currency: "USD",
    active: true,
    images: [
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    slug: "stoneware-set",
    name: "Stoneware Dinner Set",
    description: "Matte-glazed 12-piece set crafted for daily use.",
    category: "Home",
    priceCents: 12000,
    currency: "USD",
    active: true,
    images: [
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    slug: "desk-lamp",
    name: "Arc Desk Lamp",
    description: "Adjustable arm with warm LED and weighted steel base.",
    category: "Workspace",
    priceCents: 8800,
    currency: "USD",
    active: true,
    images: [
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    slug: "weekender",
    name: "Weekender Duffel",
    description: "Carry-on sized with shoe garage and interior organization.",
    category: "Travel",
    priceCents: 13800,
    currency: "USD",
    active: true,
    images: [
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    ],
  },
] as const;

const sql = await getDb();

for (const product of demoProducts) {
  await sql`
    insert into "Product" (slug, name, description, category, pricecents, currency, active, images)
    values (
      ${product.slug},
      ${product.name},
      ${product.description},
      ${product.category},
      ${product.priceCents},
      ${product.currency},
      ${product.active},
      ${product.images}
    )
    on conflict ("slug") do update set
      name = excluded.name,
      description = excluded.description,
      category = excluded.category,
      pricecents = excluded.pricecents,
      currency = excluded.currency,
      active = excluded.active,
      images = excluded.images;
  `;
}

console.log(`Seeded ${demoProducts.length} demo products.`);

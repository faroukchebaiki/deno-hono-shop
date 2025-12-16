// Simple seed script for local/dev usage. Run with:
// deno run -A prisma/seed.ts
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const sampleProducts = [
  {
    slug: "carryall-tote",
    name: "Carryall Tote",
    category: "Bags",
    priceCents: 7200,
    currency: "USD",
    description: "Waxed canvas with leather trim and interior laptop sleeve.",
    images: [
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1200&q=80"
    ],
    sku: "TOTE-001",
    inventory: 32
  },
  {
    slug: "everyday-sneaker",
    name: "Everyday Sneaker",
    category: "Footwear",
    priceCents: 9800,
    currency: "USD",
    description: "Low-profile silhouette with recycled rubber sole.",
    images: [
      "https://images.unsplash.com/photo-1514986888952-8cd320577b68?auto=format&fit=crop&w=1200&q=80"
    ],
    sku: "SHOE-001",
    inventory: 28
  },
  {
    slug: "linen-camp-shirt",
    name: "Linen Camp Shirt",
    category: "Apparel",
    priceCents: 6400,
    currency: "USD",
    description: "Airy linen blend with a relaxed drape for warmer days.",
    images: [
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80"
    ],
    sku: "SHIRT-001",
    inventory: 40
  },
  {
    slug: "stoneware-dinner-set",
    name: "Stoneware Dinner Set",
    category: "Home",
    priceCents: 12000,
    currency: "USD",
    description: "Matte-glazed 12-piece set crafted for daily use.",
    images: [
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80"
    ],
    sku: "HOME-001",
    inventory: 18
  },
  {
    slug: "arc-desk-lamp",
    name: "Arc Desk Lamp",
    category: "Workspace",
    priceCents: 8800,
    currency: "USD",
    description: "Adjustable arm with warm LED and weighted steel base.",
    images: [
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80"
    ],
    sku: "LAMP-001",
    inventory: 20
  },
  {
    slug: "weekender-duffel",
    name: "Weekender Duffel",
    category: "Travel",
    priceCents: 13800,
    currency: "USD",
    description: "Carry-on sized with shoe garage and interior organization.",
    images: [
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80"
    ],
    sku: "BAG-001",
    inventory: 22
  }
];

const seedAdmin = async () => {
  const adminEmail = Deno.env.get("SEED_ADMIN_EMAIL") ?? "admin@example.com";
  const passwordHash = Deno.env.get("SEED_ADMIN_PASSWORD_HASH") ?? undefined;

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Store Admin",
      role: Role.ADMIN,
      passwordHash,
      isActive: true
    }
  });
};

const seedProducts = async () => {
  for (const product of sampleProducts) {
    const productRecord = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        description: product.description,
        category: product.category,
        priceCents: product.priceCents,
        currency: product.currency,
        images: product.images,
        active: true
      },
      create: {
        slug: product.slug,
        name: product.name,
        description: product.description,
        category: product.category,
        priceCents: product.priceCents,
        currency: product.currency,
        images: product.images,
        active: true
      }
    });

    const variant = await prisma.productVariant.upsert({
      where: { sku: product.sku },
      update: {
        name: product.name,
        priceCents: product.priceCents,
        active: true,
        productId: productRecord.id
      },
      create: {
        sku: product.sku,
        name: product.name,
        priceCents: product.priceCents,
        active: true,
        product: { connect: { id: productRecord.id } }
      }
    });

    await prisma.inventory.upsert({
      where: { variantId: variant.id },
      update: { quantity: product.inventory, reserved: 0 },
      create: { variantId: variant.id, quantity: product.inventory, reserved: 0 }
    });
  }
};

const main = async () => {
  await seedAdmin();
  await seedProducts();
};

main()
  .then(() => {
    console.log("Seed complete");
  })
  .catch((error) => {
    console.error("Seed failed", error);
    Deno.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

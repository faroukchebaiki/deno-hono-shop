-- Minimal schema for the demo shop.
-- Keep it boring: just enough tables/columns for auth + catalog + orders.

create extension if not exists pgcrypto;

create table if not exists "User" (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  role text not null default 'CUSTOMER',
  passwordhash text,
  isactive boolean not null default true,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create table if not exists "Product" (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  category text,
  pricecents integer not null,
  currency text not null default 'USD',
  active boolean not null default true,
  images text[],
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create table if not exists "Order" (
  id uuid primary key default gen_random_uuid(),
  userid uuid references "User"(id) on delete set null,
  status text not null default 'PENDING',
  amountcents integer,
  currency text,
  cartid uuid,
  "stripeSessionId" text,
  "stripePaymentIntentId" text,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create index if not exists "Product_active_createdAt_idx" on "Product"(active, createdat desc);
create index if not exists "Product_category_idx" on "Product"(category);
create index if not exists "Order_userId_createdAt_idx" on "Order"(userid, createdat desc);

-- Stage 4: carts and order items
create table if not exists "Cart" (
  id uuid primary key default gen_random_uuid(),
  sessionid text unique not null,
  userid uuid references "User"(id) on delete set null,
  status text not null default 'ACTIVE',
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create table if not exists "CartItem" (
  id uuid primary key default gen_random_uuid(),
  cartid uuid not null references "Cart"(id) on delete cascade,
  productid uuid not null references "Product"(id) on delete cascade,
  quantity integer not null default 1,
  pricecents integer not null,
  currency text not null default 'USD',
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now(),
  unique (cartid, productid)
);

create table if not exists "OrderItem" (
  id uuid primary key default gen_random_uuid(),
  orderid uuid not null references "Order"(id) on delete cascade,
  productid uuid not null references "Product"(id) on delete restrict,
  quantity integer not null,
  pricecents integer not null,
  currency text not null default 'USD',
  productname text,
  createdat timestamptz not null default now()
);

-- Ensure new columns exist when re-running init
alter table "Order"
  add column if not exists amountcents integer,
  add column if not exists currency text,
  add column if not exists cartid uuid,
  add column if not exists "stripeSessionId" text,
  add column if not exists "stripePaymentIntentId" text;

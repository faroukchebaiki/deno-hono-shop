-- Minimal schema for the demo shop.
-- Keep it boring: just enough tables/columns for auth + catalog + orders.

create extension if not exists pgcrypto;

create table if not exists "User" (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  role text not null default 'CUSTOMER',
  passwordhash text,
  sessionversion integer not null default 0,
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
  sku text,
  stock integer,
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

-- Stage 1: addresses
create table if not exists "Address" (
  id uuid primary key default gen_random_uuid(),
  userid uuid not null references "User"(id) on delete cascade,
  type text not null default 'SHIPPING',
  label text,
  name text,
  line1 text not null,
  line2 text,
  city text not null,
  region text,
  postalcode text,
  country text not null,
  phone text,
  isdefault boolean not null default false,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create index if not exists "Address_userId_idx" on "Address"(userid);
create unique index if not exists "Address_user_default_idx"
  on "Address"(userid, type)
  where isdefault = true;

-- Stage 4: audit logs
create table if not exists "AuditLog" (
  id uuid primary key default gen_random_uuid(),
  actorid uuid references "User"(id) on delete set null,
  actorrole text,
  action text not null,
  targettype text not null,
  targetid text not null,
  metadata jsonb,
  createdat timestamptz not null default now()
);

create index if not exists "AuditLog_target_idx" on "AuditLog"(targettype, targetid);
create index if not exists "AuditLog_actor_idx" on "AuditLog"(actorid);
create index if not exists "AuditLog_createdAt_idx" on "AuditLog"(createdat desc);

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

alter table "Product"
  add column if not exists sku text,
  add column if not exists stock integer;

alter table "User"
  add column if not exists sessionversion integer;

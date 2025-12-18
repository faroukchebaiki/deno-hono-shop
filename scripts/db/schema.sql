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
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create index if not exists "Product_active_createdAt_idx" on "Product"(active, createdat desc);
create index if not exists "Product_category_idx" on "Product"(category);
create index if not exists "Order_userId_createdAt_idx" on "Order"(userid, createdat desc);

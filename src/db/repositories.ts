import type { OrderStatus, Role } from "../types/domain.ts";
import { getDb } from "./client.ts";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  passwordHash: string | null;
  isActive: boolean;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  priceCents: number;
  currency: string;
  active: boolean;
  images: string[] | null;
  createdAt: string;
};

type OrderRow = {
  id: string;
  userId: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
};

export const userRepository = {
  findByEmail: async (email: string) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      select "id", "email", "name", "role", "passwordHash", "isActive"
      from "User"
      where "email" = ${email} and "isActive" = true
      limit 1;
    `;
    return rows[0];
  },
  findActiveById: async (id: string) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      select "id", "email", "name", "role", "passwordHash", "isActive"
      from "User"
      where "id" = ${id} and "isActive" = true
      limit 1;
    `;
    return rows[0];
  },
  create: async (email: string, passwordHash: string, name?: string) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      insert into "User" ("email", "passwordHash", "name", "role", "isActive")
      values (${email}, ${passwordHash}, ${name ?? null}, 'CUSTOMER', true)
      returning "id", "email", "name", "role", "passwordHash", "isActive";
    `;
    return rows[0];
  }
};

export const productRepository = {
  listActive: async (limit = 24) => {
    const sql = await getDb();
    const rows = await sql<ProductRow>`
      select "id", "slug", "name", "description", "category", "priceCents", "currency", "active", "images", "createdAt"
      from "Product"
      where "active" = true
      order by "createdAt" desc
      limit ${limit};
    `;
    return rows;
  },
  findBySlug: async (slug: string) => {
    const sql = await getDb();
    const rows = await sql<ProductRow>`
      select "id", "slug", "name", "description", "category", "priceCents", "currency", "active", "images", "createdAt"
      from "Product"
      where "slug" = ${slug} and "active" = true
      limit 1;
    `;
    return rows[0];
  }
};

export const orderRepository = {
  listByUser: async (userId: string) => {
    const sql = await getDb();
    const rows = await sql<OrderRow>`
      select "id", "userId", "status", "createdAt", "updatedAt"
      from "Order"
      where "userId" = ${userId}
      order by "createdAt" desc;
    `;
    return rows;
  },
  findById: async (id: string) => {
    const sql = await getDb();
    const rows = await sql<OrderRow>`
      select "id", "userId", "status", "createdAt", "updatedAt"
      from "Order"
      where "id" = ${id}
      limit 1;
    `;
    return rows[0];
  },
  updateStatus: async (id: string, status: OrderStatus) => {
    const sql = await getDb();
    const rows = await sql<OrderRow>`
      update "Order"
      set "status" = ${status}, "updatedAt" = now()
      where "id" = ${id}
      returning "id", "userId", "status", "createdAt", "updatedAt";
    `;
    return rows[0];
  }
};

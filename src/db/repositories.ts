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

type ProductListOptions = {
  limit?: number;
  offset?: number;
  category?: string | null;
  query?: string | null;
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
      select
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive"
      from "User"
      where email = ${email} and isactive = true
      limit 1;
    `;
    return rows[0];
  },
  findActiveById: async (id: string) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      select
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive"
      from "User"
      where id = ${id} and isactive = true
      limit 1;
    `;
    return rows[0];
  },
  create: async (email: string, passwordHash: string, name?: string) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      insert into "User" (email, passwordhash, name, role, isactive)
      values (${email}, ${passwordHash}, ${name ?? null}, 'CUSTOMER', true)
      returning
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive";
    `;
    return rows[0];
  },
};

export const productRepository = {
  countActive: async (
    filters: { category?: string | null; query?: string | null } = {},
  ) => {
    const sql = await getDb();
    const category = filters.category ?? null;
    const query = filters.query ?? null;
    const queryPattern = query ? `%${query}%` : null;
    const rows = await sql<{ count: string }>`
      select count(*)::text as "count"
      from "Product"
      where active = true
        and (${category}::text is null or category = ${category})
        and (
          ${query}::text is null
          or name ilike ${queryPattern}
          or coalesce(description, '') ilike ${queryPattern}
        );
    `;
    return Number(rows[0]?.count ?? 0);
  },
  listCategories: async () => {
    const sql = await getDb();
    const rows = await sql<{ category: string }>`
      select distinct category
      from "Product"
      where active = true and category is not null
      order by category asc;
    `;
    return rows.map((row) => row.category).filter(Boolean);
  },
  listActive: async (options: number | ProductListOptions = {}) => {
    const sql = await getDb();
    const resolved = typeof options === "number" ? { limit: options } : options;
    const limit = resolved.limit ?? 24;
    const offset = resolved.offset ?? 0;
    const category = resolved.category ?? null;
    const query = resolved.query ?? null;
    const queryPattern = query ? `%${query}%` : null;

    const rows = await sql<ProductRow>`
      select
        id,
        slug,
        name,
        description,
        category,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt"
      from "Product"
      where active = true
        and (${category}::text is null or category = ${category})
        and (
          ${query}::text is null
          or name ilike ${queryPattern}
          or coalesce(description, '') ilike ${queryPattern}
        )
      order by createdat desc
      limit ${limit}
      offset ${offset};
    `;
    return rows;
  },
  findBySlug: async (slug: string) => {
    const sql = await getDb();
    const rows = await sql<ProductRow>`
      select
        id,
        slug,
        name,
        description,
        category,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt"
      from "Product"
      where slug = ${slug} and active = true
      limit 1;
    `;
    return rows[0];
  },
};

export const orderRepository = {
  listByUser: async (userId: string) => {
    const sql = await getDb();
    const rows = await sql<OrderRow>`
      select
        id,
        userid as "userId",
        status,
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Order"
      where userid = ${userId}
      order by createdat desc;
    `;
    return rows;
  },
  findById: async (id: string) => {
    const sql = await getDb();
    const rows = await sql<OrderRow>`
      select
        id,
        userid as "userId",
        status,
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Order"
      where id = ${id}
      limit 1;
    `;
    return rows[0];
  },
  updateStatus: async (id: string, status: OrderStatus) => {
    const sql = await getDb();
    const rows = await sql<OrderRow>`
      update "Order"
      set status = ${status}, updatedat = now()
      where id = ${id}
      returning
        id,
        userid as "userId",
        status,
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
};

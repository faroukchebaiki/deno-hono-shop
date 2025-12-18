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
  amountCents: number | null;
  currency: string | null;
  cartId: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
  updatedAt: string;
};

type CartRow = {
  id: string;
  sessionId: string;
  userId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type CartItemRow = {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  priceCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

type CartItemWithProduct = CartItemRow & {
  productSlug: string;
  productName: string;
  productDescription: string | null;
  productCategory: string | null;
  productImages: string[] | null;
  productActive: boolean;
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
  findById: async (id: string) => {
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
      where id = ${id} and active = true
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
        amountcents as "amountCents",
        currency,
        cartid as "cartId",
        "stripeSessionId" as "stripeSessionId",
        "stripePaymentIntentId" as "stripePaymentIntentId",
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Order"
      where userid = ${userId}
      order by createdat desc;
    `;
    return rows;
  },
  listAll: async (limit = 50) => {
    const sql = await getDb();
    const rows = await sql<OrderRow>`
      select
        id,
        userid as "userId",
        status,
        amountcents as "amountCents",
        currency,
        cartid as "cartId",
        "stripeSessionId" as "stripeSessionId",
        "stripePaymentIntentId" as "stripePaymentIntentId",
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Order"
      order by createdat desc
      limit ${limit};
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
        amountcents as "amountCents",
        currency,
        cartid as "cartId",
        "stripeSessionId" as "stripeSessionId",
        "stripePaymentIntentId" as "stripePaymentIntentId",
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
        amountcents as "amountCents",
        currency,
        cartid as "cartId",
        "stripeSessionId" as "stripeSessionId",
        "stripePaymentIntentId" as "stripePaymentIntentId",
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  findByStripeSessionId: async (sessionId: string) => {
    const sql = await getDb();
    const rows = await sql<OrderRow>`
      select
        id,
        userid as "userId",
        status,
        amountcents as "amountCents",
        currency,
        cartid as "cartId",
        "stripeSessionId" as "stripeSessionId",
        "stripePaymentIntentId" as "stripePaymentIntentId",
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Order"
      where "stripeSessionId" = ${sessionId}
      limit 1;
    `;
    return rows[0];
  },
  create: async (
    order: {
      userId: string | null;
      cartId: string | null;
      amountCents: number;
      currency: string;
      status: OrderStatus;
      stripeSessionId: string | null;
      stripePaymentIntentId: string | null;
      items: {
        productId: string;
        quantity: number;
        priceCents: number;
        currency: string;
        productName: string;
      }[];
    },
  ) => {
    const sql = await getDb();
    return await sql.transaction(async (tx) => {
      const [created] = await tx<OrderRow>`
        insert into "Order" (
          userid,
          cartid,
          status,
          amountcents,
          currency,
          "stripeSessionId",
          "stripePaymentIntentId"
        ) values (
          ${order.userId},
          ${order.cartId},
          ${order.status},
          ${order.amountCents},
          ${order.currency},
          ${order.stripeSessionId},
          ${order.stripePaymentIntentId}
        )
        returning
          id,
          userid as "userId",
          status,
          amountcents as "amountCents",
          currency,
          cartid as "cartId",
          "stripeSessionId" as "stripeSessionId",
          "stripePaymentIntentId" as "stripePaymentIntentId",
          createdat as "createdAt",
          updatedat as "updatedAt";
      `;

      for (const item of order.items) {
        await tx`
          insert into "OrderItem" (
            orderid,
            productid,
            quantity,
            pricecents,
            currency,
            productname
          ) values (
            ${created.id},
            ${item.productId},
            ${item.quantity},
            ${item.priceCents},
            ${item.currency},
            ${item.productName}
          );
        `;
      }

      return created;
    });
  },
  updateStripeState: async (
    id: string,
    params: {
      status: OrderStatus;
      stripePaymentIntentId?: string | null;
    },
  ) => {
    const sql = await getDb();
    const rows = await sql<OrderRow>`
      update "Order"
      set
        status = ${params.status},
        "stripePaymentIntentId" = coalesce(${
      params.stripePaymentIntentId ?? null
    }, "stripePaymentIntentId"),
        updatedat = now()
      where id = ${id}
      returning
        id,
        userid as "userId",
        status,
        amountcents as "amountCents",
        currency,
        cartid as "cartId",
        "stripeSessionId" as "stripeSessionId",
        "stripePaymentIntentId" as "stripePaymentIntentId",
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  setStripeSessionId: async (id: string, sessionId: string) => {
    const sql = await getDb();
    const rows = await sql<OrderRow>`
      update "Order"
      set "stripeSessionId" = ${sessionId}, updatedat = now()
      where id = ${id}
      returning
        id,
        userid as "userId",
        status,
        amountcents as "amountCents",
        currency,
        cartid as "cartId",
        "stripeSessionId" as "stripeSessionId",
        "stripePaymentIntentId" as "stripePaymentIntentId",
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
};

export const cartRepository = {
  getOrCreateBySession: async (sessionId: string, userId?: string | null) => {
    const sql = await getDb();
    const rows = await sql<CartRow>`
      insert into "Cart" (sessionid, userid)
      values (${sessionId}, ${userId ?? null})
      on conflict (sessionid) do update set userid = coalesce(excluded.userid, "Cart".userid)
      returning
        id,
        sessionid as "sessionId",
        userid as "userId",
        status,
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  attachUser: async (cartId: string, userId: string) => {
    const sql = await getDb();
    const rows = await sql<CartRow>`
      update "Cart"
      set userid = coalesce(userid, ${userId}), updatedat = now()
      where id = ${cartId}
      returning
        id,
        sessionid as "sessionId",
        userid as "userId",
        status,
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  addItem: async (
    cartId: string,
    product: { id: string; priceCents: number; currency: string; name: string },
    quantity: number,
  ) => {
    const sql = await getDb();
    const rows = await sql<CartItemRow>`
      insert into "CartItem" (cartid, productid, quantity, pricecents, currency)
      values (${cartId}, ${product.id}, ${quantity}, ${product.priceCents}, ${product.currency})
      on conflict (cartid, productid) do update set
        quantity = "CartItem".quantity + excluded.quantity,
        pricecents = excluded.pricecents,
        currency = excluded.currency,
        updatedat = now()
      returning
        id,
        cartid as "cartId",
        productid as "productId",
        quantity,
        pricecents as "priceCents",
        currency,
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  listWithProducts: async (cartId: string) => {
    const sql = await getDb();
    const rows = await sql<CartItemWithProduct>`
      select
        ci.id,
        ci.cartid as "cartId",
        ci.productid as "productId",
        ci.quantity,
        ci.pricecents as "priceCents",
        ci.currency,
        ci.createdat as "createdAt",
        ci.updatedat as "updatedAt",
        p.slug as "productSlug",
        p.name as "productName",
        p.description as "productDescription",
        p.category as "productCategory",
        p.images as "productImages",
        p.active as "productActive"
      from "CartItem" ci
      join "Product" p on ci.productid = p.id
      where ci.cartid = ${cartId}
      order by ci.createdat desc;
    `;
    return rows;
  },
  updateQuantity: async (cartId: string, itemId: string, quantity: number) => {
    const sql = await getDb();
    if (quantity <= 0) {
      await sql`
        delete from "CartItem"
        where cartid = ${cartId} and id = ${itemId};
      `;
      return null;
    }
    const rows = await sql<CartItemRow>`
      update "CartItem"
      set quantity = ${quantity}, updatedat = now()
      where cartid = ${cartId} and id = ${itemId}
      returning
        id,
        cartid as "cartId",
        productid as "productId",
        quantity,
        pricecents as "priceCents",
        currency,
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0] ?? null;
  },
  clear: async (cartId: string) => {
    const sql = await getDb();
    await sql`delete from "CartItem" where cartid = ${cartId};`;
  },
};

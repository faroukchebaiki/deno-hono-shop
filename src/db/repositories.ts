import type { OrderStatus, Role } from "../types/domain.ts";
import { getDb } from "./client.ts";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  passwordHash: string | null;
  isActive: boolean;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
};

type ProductListOptions = {
  limit?: number;
  offset?: number;
  category?: string | null;
  query?: string | null;
  sort?: string | null;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  stock: number | null;
  priceCents: number;
  currency: string;
  active: boolean;
  images: string[] | null;
  createdAt: string;
  updatedAt: string;
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

type OrderItemRow = {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  priceCents: number;
  currency: string;
  productName: string | null;
  createdAt: string;
  productSlug: string | null;
  productImages: string[] | null;
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

type AddressRow = {
  id: string;
  userId: string;
  type: string;
  label: string | null;
  name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type AuditLogRow = {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
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
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "User"
      where email = ${email} and isactive = true
      limit 1;
    `;
    return rows[0];
  },
  findByEmailAny: async (email: string) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      select
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "User"
      where email = ${email}
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
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "User"
      where id = ${id} and isactive = true
      limit 1;
    `;
    return rows[0];
  },
  findByIdAny: async (id: string) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      select
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "User"
      where id = ${id}
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
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  updateProfile: async (
    id: string,
    profile: { email: string; name?: string | null },
  ) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      update "User"
      set
        email = ${profile.email},
        name = ${profile.name ?? null},
        updatedat = now()
      where id = ${id}
      returning
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  updatePassword: async (id: string, passwordHash: string) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      update "User"
      set passwordhash = ${passwordHash}, updatedat = now()
      where id = ${id}
      returning
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  listAll: async (limit = 200) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      select
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "User"
      order by createdat desc
      limit ${limit};
    `;
    return rows;
  },
  setRole: async (id: string, role: Role) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      update "User"
      set role = ${role}, updatedat = now()
      where id = ${id}
      returning
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  setActive: async (id: string, isActive: boolean) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      update "User"
      set isactive = ${isActive}, updatedat = now()
      where id = ${id}
      returning
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  bumpSessionVersion: async (id: string) => {
    const sql = await getDb();
    const rows = await sql<UserRow>`
      update "User"
      set sessionversion = sessionversion + 1, updatedat = now()
      where id = ${id}
      returning
        id,
        email,
        name,
        role,
        passwordhash as "passwordHash",
        isactive as "isActive",
        sessionversion as "sessionVersion",
        createdat as "createdAt",
        updatedat as "updatedAt";
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
    const sort = resolved.sort ?? "newest";

    const rows = await sql<ProductRow>`
      select
        id,
        slug,
        name,
        description,
        category,
        sku,
        stock,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Product"
      where active = true
        and (${category}::text is null or category = ${category})
        and (
          ${query}::text is null
          or name ilike ${queryPattern}
          or coalesce(description, '') ilike ${queryPattern}
        )
      order by
        case when ${sort} = 'price-asc' then pricecents end asc nulls last,
        case when ${sort} = 'price-desc' then pricecents end desc nulls last,
        case when ${sort} = 'name-asc' then name end asc nulls last,
        case when ${sort} = 'name-desc' then name end desc nulls last,
        createdat desc
      limit ${limit}
      offset ${offset};
    `;
    return rows;
  },
  listAll: async (options: { limit?: number; offset?: number } = {}) => {
    const sql = await getDb();
    const limit = options.limit ?? 200;
    const offset = options.offset ?? 0;
    const rows = await sql<ProductRow>`
      select
        id,
        slug,
        name,
        description,
        category,
        sku,
        stock,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Product"
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
        sku,
        stock,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt",
        updatedat as "updatedAt"
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
        sku,
        stock,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Product"
      where id = ${id} and active = true
      limit 1;
    `;
    return rows[0];
  },
  findByIdAdmin: async (id: string) => {
    const sql = await getDb();
    const rows = await sql<ProductRow>`
      select
        id,
        slug,
        name,
        description,
        category,
        sku,
        stock,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Product"
      where id = ${id}
      limit 1;
    `;
    return rows[0];
  },
  findBySlugAny: async (slug: string) => {
    const sql = await getDb();
    const rows = await sql<ProductRow>`
      select
        id,
        slug,
        name,
        description,
        category,
        sku,
        stock,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Product"
      where slug = ${slug}
      limit 1;
    `;
    return rows[0];
  },
  create: async (product: {
    slug: string;
    name: string;
    description: string | null;
    category: string | null;
    sku: string | null;
    stock: number | null;
    priceCents: number;
    currency: string;
    active: boolean;
    images: string[] | null;
  }) => {
    const sql = await getDb();
    const rows = await sql<ProductRow>`
      insert into "Product" (
        slug,
        name,
        description,
        category,
        sku,
        stock,
        pricecents,
        currency,
        active,
        images
      ) values (
        ${product.slug},
        ${product.name},
        ${product.description},
        ${product.category},
        ${product.sku},
        ${product.stock},
        ${product.priceCents},
        ${product.currency},
        ${product.active},
        ${product.images}
      )
      returning
        id,
        slug,
        name,
        description,
        category,
        sku,
        stock,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  update: async (
    id: string,
    product: {
      slug: string;
      name: string;
      description: string | null;
      category: string | null;
      sku: string | null;
      stock: number | null;
      priceCents: number;
      currency: string;
      active: boolean;
      images: string[] | null;
    },
  ) => {
    const sql = await getDb();
    const rows = await sql<ProductRow>`
      update "Product"
      set
        slug = ${product.slug},
        name = ${product.name},
        description = ${product.description},
        category = ${product.category},
        sku = ${product.sku},
        stock = ${product.stock},
        pricecents = ${product.priceCents},
        currency = ${product.currency},
        active = ${product.active},
        images = ${product.images},
        updatedat = now()
      where id = ${id}
      returning
        id,
        slug,
        name,
        description,
        category,
        sku,
        stock,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt",
        updatedat as "updatedAt";
    `;
    return rows[0];
  },
  setActive: async (id: string, active: boolean) => {
    const sql = await getDb();
    const rows = await sql<ProductRow>`
      update "Product"
      set active = ${active}, updatedat = now()
      where id = ${id}
      returning
        id,
        slug,
        name,
        description,
        category,
        sku,
        stock,
        pricecents as "priceCents",
        currency,
        active,
        images,
        createdat as "createdAt",
        updatedat as "updatedAt";
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

export const orderItemRepository = {
  listByOrderId: async (orderId: string) => {
    const sql = await getDb();
    const rows = await sql<OrderItemRow>`
      select
        oi.id,
        oi.orderid as "orderId",
        oi.productid as "productId",
        oi.quantity,
        oi.pricecents as "priceCents",
        oi.currency,
        oi.productname as "productName",
        oi.createdat as "createdAt",
        p.slug as "productSlug",
        p.images as "productImages"
      from "OrderItem" oi
      left join "Product" p on p.id = oi.productid
      where oi.orderid = ${orderId}
      order by oi.createdat asc;
    `;
    return rows;
  },
};

export const auditLogRepository = {
  create: async (entry: {
    actorId: string | null;
    actorRole: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown> | null;
  }) => {
    const sql = await getDb();
    const metadataValue = entry.metadata
      ? JSON.stringify(entry.metadata)
      : null;
    const rows = await sql<AuditLogRow>`
      insert into "AuditLog" (
        actorid,
        actorrole,
        action,
        targettype,
        targetid,
        metadata
      ) values (
        ${entry.actorId},
        ${entry.actorRole},
        ${entry.action},
        ${entry.targetType},
        ${entry.targetId},
        ${metadataValue}
      )
      returning
        id,
        actorid as "actorId",
        actorrole as "actorRole",
        null::text as "actorEmail",
        action,
        targettype as "targetType",
        targetid as "targetId",
        metadata,
        createdat as "createdAt";
    `;
    return rows[0];
  },
  listByTarget: async (targetType: string, targetId: string, limit = 50) => {
    const sql = await getDb();
    const rows = await sql<AuditLogRow>`
      select
        al.id,
        al.actorid as "actorId",
        al.actorrole as "actorRole",
        u.email as "actorEmail",
        al.action,
        al.targettype as "targetType",
        al.targetid as "targetId",
        al.metadata,
        al.createdat as "createdAt"
      from "AuditLog" al
      left join "User" u on u.id = al.actorid
      where al.targettype = ${targetType} and al.targetid = ${targetId}
      order by al.createdat desc
      limit ${limit};
    `;
    return rows;
  },
  listRecent: async (limit = 100) => {
    const sql = await getDb();
    const rows = await sql<AuditLogRow>`
      select
        al.id,
        al.actorid as "actorId",
        al.actorrole as "actorRole",
        u.email as "actorEmail",
        al.action,
        al.targettype as "targetType",
        al.targetid as "targetId",
        al.metadata,
        al.createdat as "createdAt"
      from "AuditLog" al
      left join "User" u on u.id = al.actorid
      order by al.createdat desc
      limit ${limit};
    `;
    return rows;
  },
};

export const addressRepository = {
  listByUser: async (userId: string) => {
    const sql = await getDb();
    const rows = await sql<AddressRow>`
      select
        id,
        userid as "userId",
        type,
        label,
        name,
        line1,
        line2,
        city,
        region,
        postalcode as "postalCode",
        country,
        phone,
        isdefault as "isDefault",
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Address"
      where userid = ${userId}
      order by createdat desc;
    `;
    return rows;
  },
  findById: async (userId: string, id: string) => {
    const sql = await getDb();
    const rows = await sql<AddressRow>`
      select
        id,
        userid as "userId",
        type,
        label,
        name,
        line1,
        line2,
        city,
        region,
        postalcode as "postalCode",
        country,
        phone,
        isdefault as "isDefault",
        createdat as "createdAt",
        updatedat as "updatedAt"
      from "Address"
      where userid = ${userId} and id = ${id}
      limit 1;
    `;
    return rows[0];
  },
  create: async (
    userId: string,
    address: {
      type: string;
      label: string | null;
      name: string | null;
      line1: string;
      line2: string | null;
      city: string;
      region: string | null;
      postalCode: string | null;
      country: string;
      phone: string | null;
      isDefault: boolean;
    },
  ) => {
    const sql = await getDb();
    return await sql.transaction(async (tx) => {
      if (address.isDefault) {
        await tx`
          update "Address"
          set isdefault = false, updatedat = now()
          where userid = ${userId} and type = ${address.type};
        `;
      }
      const rows = await tx<AddressRow>`
        insert into "Address" (
          userid,
          type,
          label,
          name,
          line1,
          line2,
          city,
          region,
          postalcode,
          country,
          phone,
          isdefault
        ) values (
          ${userId},
          ${address.type},
          ${address.label},
          ${address.name},
          ${address.line1},
          ${address.line2},
          ${address.city},
          ${address.region},
          ${address.postalCode},
          ${address.country},
          ${address.phone},
          ${address.isDefault}
        )
        returning
          id,
          userid as "userId",
          type,
          label,
          name,
          line1,
          line2,
          city,
          region,
          postalcode as "postalCode",
          country,
          phone,
          isdefault as "isDefault",
          createdat as "createdAt",
          updatedat as "updatedAt";
      `;
      return rows[0];
    });
  },
  update: async (
    userId: string,
    id: string,
    address: {
      type: string;
      label: string | null;
      name: string | null;
      line1: string;
      line2: string | null;
      city: string;
      region: string | null;
      postalCode: string | null;
      country: string;
      phone: string | null;
      isDefault: boolean;
    },
  ) => {
    const sql = await getDb();
    return await sql.transaction(async (tx) => {
      if (address.isDefault) {
        await tx`
          update "Address"
          set isdefault = false, updatedat = now()
          where userid = ${userId} and type = ${address.type};
        `;
      }
      const rows = await tx<AddressRow>`
        update "Address"
        set
          type = ${address.type},
          label = ${address.label},
          name = ${address.name},
          line1 = ${address.line1},
          line2 = ${address.line2},
          city = ${address.city},
          region = ${address.region},
          postalcode = ${address.postalCode},
          country = ${address.country},
          phone = ${address.phone},
          isdefault = ${address.isDefault},
          updatedat = now()
        where userid = ${userId} and id = ${id}
        returning
          id,
          userid as "userId",
          type,
          label,
          name,
          line1,
          line2,
          city,
          region,
          postalcode as "postalCode",
          country,
          phone,
          isdefault as "isDefault",
          createdat as "createdAt",
          updatedat as "updatedAt";
      `;
      return rows[0];
    });
  },
  remove: async (userId: string, id: string) => {
    const sql = await getDb();
    await sql`
      delete from "Address"
      where userid = ${userId} and id = ${id};
    `;
  },
  setDefault: async (userId: string, id: string) => {
    const sql = await getDb();
    return await sql.transaction(async (tx) => {
      const rows = await tx<AddressRow>`
        select
          id,
          userid as "userId",
          type,
          label,
          name,
          line1,
          line2,
          city,
          region,
          postalcode as "postalCode",
          country,
          phone,
          isdefault as "isDefault",
          createdat as "createdAt",
          updatedat as "updatedAt"
        from "Address"
        where userid = ${userId} and id = ${id}
        limit 1;
      `;
      const target = rows[0];
      if (!target) return null;
      await tx`
        update "Address"
        set isdefault = false, updatedat = now()
        where userid = ${userId} and type = ${target.type};
      `;
      const updated = await tx<AddressRow>`
        update "Address"
        set isdefault = true, updatedat = now()
        where userid = ${userId} and id = ${id}
        returning
          id,
          userid as "userId",
          type,
          label,
          name,
          line1,
          line2,
          city,
          region,
          postalcode as "postalCode",
          country,
          phone,
          isdefault as "isDefault",
          createdat as "createdAt",
          updatedat as "updatedAt";
      `;
      return updated[0];
    });
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

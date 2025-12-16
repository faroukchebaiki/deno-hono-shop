import { OrderStatus } from "@prisma/client";
import { getPrismaClient } from "./client.ts";

const prisma = getPrismaClient();

export const userRepository = {
  findByEmail: (email: string) =>
    prisma.user.findFirst({
      where: { email, isActive: true }
    }),
  findActiveById: (id: string) =>
    prisma.user.findFirst({
      where: { id, isActive: true }
    }),
  create: (email: string, passwordHash: string, name?: string) =>
    prisma.user.create({
      data: {
        email,
        passwordHash,
        name
      }
    })
};

export const productRepository = {
  listActive: (limit = 24) =>
    prisma.product.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        variants: { include: { inventory: true } }
      }
    }),
  findBySlug: (slug: string) =>
    prisma.product.findUnique({
      where: { slug },
      include: {
        variants: { include: { inventory: true } }
      }
    })
};

export const orderRepository = {
  listByUser: (userId: string) =>
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { product: true, variant: true } },
        payment: true,
        shippingAddress: true,
        billingAddress: true
      }
    }),
  findById: (id: string) =>
    prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: true, variant: true } },
        payment: true,
        shippingAddress: true,
        billingAddress: true
      }
    }),
  updateStatus: (id: string, status: OrderStatus) =>
    prisma.order.update({
      where: { id },
      data: { status, updatedAt: new Date() }
    })
};

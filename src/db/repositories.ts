import type { OrderStatus } from "@prisma/client";
import { getPrismaClient } from "./client.ts";

export const userRepository = {
  findByEmail: async (email: string) => {
    const prisma = await getPrismaClient();
    return prisma.user.findFirst({
      where: { email, isActive: true }
    });
  },
  findActiveById: async (id: string) => {
    const prisma = await getPrismaClient();
    return prisma.user.findFirst({
      where: { id, isActive: true }
    });
  },
  create: async (email: string, passwordHash: string, name?: string) => {
    const prisma = await getPrismaClient();
    return prisma.user.create({
      data: {
        email,
        passwordHash,
        name
      }
    });
  }
};

export const productRepository = {
  listActive: async (limit = 24) => {
    const prisma = await getPrismaClient();
    return prisma.product.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        variants: { include: { inventory: true } }
      }
    });
  },
  findBySlug: async (slug: string) => {
    const prisma = await getPrismaClient();
    return prisma.product.findUnique({
      where: { slug },
      include: {
        variants: { include: { inventory: true } }
      }
    });
  }
};

export const orderRepository = {
  listByUser: async (userId: string) => {
    const prisma = await getPrismaClient();
    return prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { product: true, variant: true } },
        payment: true,
        shippingAddress: true,
        billingAddress: true
      }
    });
  },
  findById: async (id: string) => {
    const prisma = await getPrismaClient();
    return prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: true, variant: true } },
        payment: true,
        shippingAddress: true,
        billingAddress: true
      }
    });
  },
  updateStatus: async (id: string, status: OrderStatus) => {
    const prisma = await getPrismaClient();
    return prisma.order.update({
      where: { id },
      data: { status, updatedAt: new Date() }
    });
  }
};

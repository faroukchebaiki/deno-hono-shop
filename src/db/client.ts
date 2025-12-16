import Prisma from "@prisma/client";

const { PrismaClient } = Prisma;

let prisma: Prisma.PrismaClient | null = null;

// Lazy singleton to avoid opening multiple database connections.
export const getPrismaClient = (): PrismaClient => {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
};

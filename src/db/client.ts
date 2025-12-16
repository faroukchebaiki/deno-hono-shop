import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;

// Lazy singleton to avoid opening multiple database connections.
export const getPrismaClient = (): PrismaClient => {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
};

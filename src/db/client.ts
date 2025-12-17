import type { PrismaClient as NodePrismaClient } from "@prisma/client";
import type { PrismaClient as EdgePrismaClient } from "@prisma/client/edge";

let prisma: NodePrismaClient | EdgePrismaClient | null = null;

const createClient = async () => {
  if (prisma) return prisma;

  const accelerateUrl = Deno.env.get("PRISMA_ACCELERATE_URL");
  if (accelerateUrl) {
    const { PrismaClient } = await import("@prisma/client/edge");
    const { withAccelerate } = await import("@prisma/extension-accelerate");
    prisma = new PrismaClient({
      datasourceUrl: accelerateUrl
    }).$extends(withAccelerate());
  } else {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient() as unknown as NodePrismaClient;
  }

  return prisma;
};

export const getPrismaClient = (): Promise<NodePrismaClient | EdgePrismaClient> =>
  createClient();

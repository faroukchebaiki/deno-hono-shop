import type { PrismaClient as NodePrismaClient } from "@prisma/client";
import type { PrismaClient as EdgePrismaClient } from "@prisma/client/edge";

const isEdge = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));

let prisma: NodePrismaClient | EdgePrismaClient | null = null;

const createClient = async () => {
  if (prisma) return prisma;

  if (isEdge) {
    const accelerateUrl = Deno.env.get("PRISMA_ACCELERATE_URL");
    if (!accelerateUrl) {
      throw new Error("PRISMA_ACCELERATE_URL is required in edge/deploy environments.");
    }
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

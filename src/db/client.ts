import type { PrismaClient as NodePrismaClient } from "@prisma/client";

const isEdge = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));
const accelerateUrl = Deno.env.get("PRISMA_ACCELERATE_URL");

let prisma: NodePrismaClient;

if (isEdge) {
  if (!accelerateUrl) {
    throw new Error("PRISMA_ACCELERATE_URL is required in edge/deploy environments.");
  }
  const { PrismaClient } = await import("@prisma/client/edge");
  const { withAccelerate } = await import("@prisma/extension-accelerate");
  prisma = new PrismaClient({
    datasourceUrl: Deno.env.get("DATABASE_URL")
  }).$extends(withAccelerate());
} else {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient() as unknown as NodePrismaClient;
}

// Lazy singleton already constructed at module import.
export const getPrismaClient = (): NodePrismaClient => prisma;

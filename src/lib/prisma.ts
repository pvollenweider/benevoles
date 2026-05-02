import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof createPrismaClient>; prismaVer?: string }
const CURRENT_VER = "v2"

export const prisma =
  globalForPrisma.prismaVer === CURRENT_VER ? globalForPrisma.prisma : createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaVer = CURRENT_VER
}

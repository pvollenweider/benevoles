import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import ProductUpdatesManager from "@/components/super-admin/ProductUpdatesManager"

export const dynamic = "force-dynamic"

export default async function ProductUpdatesPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const [sends, recipientCount] = await Promise.all([
    prisma.productUpdateSend.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.adminUser.count({ where: { isActive: true, receiveProductUpdates: true } }),
  ])

  return (
    <ProductUpdatesManager
      recipientCount={recipientCount}
      initialSends={sends.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))}
    />
  )
}

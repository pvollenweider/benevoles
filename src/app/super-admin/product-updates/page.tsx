import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import ProductUpdatesManager from "@/components/super-admin/ProductUpdatesManager"
import { changelogReleases } from "@/lib/public-content"
import { productUpdateDrafts } from "@/lib/product-update-draft"
import { apexBaseUrl } from "@/lib/urls"
import { siteName } from "@/lib/site"
import { REPOSITORY_URL } from "@/lib/structured-data"

export const dynamic = "force-dynamic"

export default async function ProductUpdatesPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const [sends, recipientCount] = await Promise.all([
    prisma.productUpdateSend.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.adminUser.count({ where: { isActive: true, receiveProductUpdates: true } }),
  ])

  // One draft per released version (#762), the same filter as /nouveautes: computed here, after
  // the role check, so the client never reads CHANGELOG.md. 24 versions of at most 10 000 characters.
  const drafts = productUpdateDrafts(changelogReleases(), { siteName: siteName(), baseUrl: apexBaseUrl(), repositoryUrl: REPOSITORY_URL })

  return (
    <ProductUpdatesManager
      recipientCount={recipientCount}
      drafts={drafts}
      initialSends={sends.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))}
    />
  )
}

import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import OrgsManager from "@/components/super-admin/OrgsManager"
import { orgTimeZone } from "@/lib/time-zone"
import { ORG_SORT_COLS } from "@/lib/super-admin-tables"
import { parseSortParam } from "@/lib/table-sort"

export const dynamic = "force-dynamic"

export default async function SuperAdminOrgsPage({ searchParams }: { searchParams: Promise<{ tri?: string | string[] }> }) {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      suspendedAt: true,
      suspensionReason: true,
      publicationApprovedAt: true,
      outboundEmailApprovedAt: true,
      createdAt: true,
      timeZone: true,
      _count: {
        select: {
          events: true,
          admins: true,
          volunteers: true,
        },
      },
    },
  })

  const { tri } = await searchParams

  return (
    <OrgsManager
      initialSort={parseSortParam(tri, ORG_SORT_COLS)}
      initialOrgs={orgs.map(({ timeZone, ...o }) => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        // Formatted here, in the organisation's zone: the same text on the server and in the browser.
        createdLabel: o.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: orgTimeZone({ timeZone }) }),
        suspendedAt: o.suspendedAt?.toISOString() ?? null,
        publicationApprovedAt: o.publicationApprovedAt?.toISOString() ?? null,
        outboundEmailApprovedAt: o.outboundEmailApprovedAt?.toISOString() ?? null,
      }))}
    />
  )
}

import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import OrgDetail from "@/components/super-admin/OrgDetail"
import { loadOrganizationCumulative } from "@/lib/usage-stats"
import { loadOrganizationInactivity } from "@/lib/org-inactivity-data"
import { inactivityMode, inactivityStatusText } from "@/lib/org-inactivity"
import { APP_TIME_ZONE } from "@/lib/time-zone"

const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: APP_TIME_ZONE, day: "numeric", month: "long", year: "numeric" })

export const dynamic = "force-dynamic"

export default async function OrgDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const { slug } = await params

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      suspendedAt: true,
      suspensionReason: true,
      signupDescription: true,
      publicationApprovedAt: true,
      outboundEmailApprovedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          events: true,
          admins: true,
          volunteers: true,
        },
      },
      admins: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!org) notFound()
  const now = new Date()
  const [cumulative, inactivity] = await Promise.all([loadOrganizationCumulative(org.id), loadOrganizationInactivity(org.id, now)])

  return (
    <OrgDetail
      org={{
        ...org,
        createdAt: org.createdAt.toISOString(),
        suspendedAt: org.suspendedAt?.toISOString() ?? null,
        publicationApprovedAt: org.publicationApprovedAt?.toISOString() ?? null,
        outboundEmailApprovedAt: org.outboundEmailApprovedAt?.toISOString() ?? null,
        updatedAt: org.updatedAt.toISOString(),
        admins: org.admins.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      }}
      cumulative={cumulative}
      inactivity={inactivity ? {
        orgId: org.id,
        status: inactivityStatusText(inactivity, inactivityMode(), now, day),
        postponed: inactivity.postponedUntil !== null && inactivity.postponedUntil.getTime() > now.getTime(),
        exempt: inactivity.exempt,
        applies: org.active && org.suspendedAt === null,
      } : undefined}
    />
  )
}

import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import OrgDetail from "@/components/super-admin/OrgDetail"
import { loadOrganizationCumulative } from "@/lib/usage-stats"
import { loadOrganizationInactivity } from "@/lib/org-inactivity-data"
import { inactivityMode, inactivityStatusText } from "@/lib/org-inactivity"
import { APP_TIME_ZONE } from "@/lib/time-zone"
import { loadLimitHits } from "@/lib/limit-hits-data"
import { LIMIT_HITS_DAYS, zoneSentence } from "@/lib/limit-hits-view"
import { loadSendBatches } from "@/lib/send-batches-data"
import { batchSummary } from "@/lib/send-batches"
import { daysAgo } from "@/lib/retention"


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
      signupSource: true,
      signupSourceDetail: true,
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
  const [cumulative, inactivity, limitHits] = await Promise.all([loadOrganizationCumulative(org.id), loadOrganizationInactivity(org.id, now), loadLimitHits({ organizationId: org.id, now })])
  // Its batches of emails of the same days (#1101): the same records the organisers see.
  const batches = await loadSendBatches(org.id, { since: daysAgo(now, LIMIT_HITS_DAYS), limit: 30 })
  const at = (d: Date) => d.toLocaleString("fr-FR", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

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
      zone={zoneSentence(APP_TIME_ZONE)}
      recentBatches={batches.map((b) => ({ id: b.id, line: `${b.kindLabel}, ${b.eventTitle}, ${at(b.createdAt)}\u00a0: ${batchSummary(b.delivery)}.`, createdAt: b.createdAt.toISOString(), heldSentence: b.heldSentence, failed: b.delivery.failed > 0 }))}
      limitHits={limitHits.groups[0] ? { group: limitHits.groups[0], zone: zoneSentence(APP_TIME_ZONE), truncated: limitHits.truncated } : undefined}
      inactivity={inactivity ? {
        orgId: org.id,
        // The procedure's dates in the organisation's own zone (#1114), said when it is not the default.
        status: inactivityStatusText(inactivity, inactivityMode(), now, (d) => d.toLocaleDateString("fr-FR", { timeZone: inactivity.timeZone, day: "numeric", month: "long", year: "numeric" }))
          + (inactivity.procedure && inactivity.timeZone !== APP_TIME_ZONE ? ` Dates en heure de ${inactivity.timeZone}.` : ""),
        postponed: inactivity.postponedUntil !== null && inactivity.postponedUntil.getTime() > now.getTime(),
        exempt: inactivity.exempt,
        applies: org.active && org.suspendedAt === null,
      } : undefined}
    />
  )
}

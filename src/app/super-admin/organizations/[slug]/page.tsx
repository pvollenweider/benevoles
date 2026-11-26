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
import { loadAdminEmails } from "@/lib/admin-emails-data"
import { dayZoneSentence } from "@/lib/admin-emails-view"
import { reportError } from "@/lib/report-error"
import { daysAgo, RETENTION_DAYS } from "@/lib/retention"
import { FRONT_DESK_ROLE, ORG_ACCOUNT_ROLE_WHERE } from "@/lib/permissions"


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
      autoApprovedAt: true,
      autoApprovalReviewedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          events: true,
          // The administrators as before (#1142): a front-desk account is not one of them.
          admins: { where: ORG_ACCOUNT_ROLE_WHERE },
          volunteers: true,
        },
      },
      admins: {
        where: ORG_ACCOUNT_ROLE_WHERE,
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
  const [cumulative, inactivity, limitHits, frontDeskCount, adminEmails] = await Promise.all([
    loadOrganizationCumulative(org.id),
    loadOrganizationInactivity(org.id, now),
    loadLimitHits({ organizationId: org.id, now }),
    // Apart from the administrators (#1142): one count, never the list.
    prisma.adminUser.count({ where: { organizationId: org.id, role: FRONT_DESK_ROLE } }),
    // The emails its administrators received, over the DeliveryOutcome retention window. A
    // failure here must not take down the whole sheet and its actions (there is no error.tsx):
    // the section says it is unavailable, and only the error is reported, never the SQL or a value.
    loadAdminEmails({ organizationId: org.id, now }).catch((error) => {
      reportError("super_admin.organization_admin_emails")(error)
      return null
    }),
  ])
  // Its batches of emails of the same days (#1101): the same records the organisers see.
  const batches = await loadSendBatches(org.id, { since: daysAgo(now, LIMIT_HITS_DAYS), limit: 30 })
  const at = (d: Date) => d.toLocaleString("fr-FR", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  // A civil day ("YYYY-MM-DD") is already a calendar day: format it as UTC, not in the operator's
  // zone (which would shift it again).
  const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

  return (
    <OrgDetail
      org={{
        ...org,
        createdAt: org.createdAt.toISOString(),
        suspendedAt: org.suspendedAt?.toISOString() ?? null,
        publicationApprovedAt: org.publicationApprovedAt?.toISOString() ?? null,
        outboundEmailApprovedAt: org.outboundEmailApprovedAt?.toISOString() ?? null,
        autoApprovedAt: org.autoApprovedAt?.toISOString() ?? null,
        autoApprovalReviewedAt: org.autoApprovalReviewedAt?.toISOString() ?? null,
        updatedAt: org.updatedAt.toISOString(),
        admins: org.admins.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      }}
      cumulative={cumulative}
      frontDeskCount={frontDeskCount}
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
      adminEmails={adminEmails ? {
        unavailable: false,
        rows: adminEmails.rows.map((r) => ({ dateTime: r.day, dateLabel: longDay(r.day), kindLabel: r.kindLabel, accepted: r.accepted, failed: r.failed })),
        days: RETENTION_DAYS.deliveryOutcome,
        zone: dayZoneSentence(APP_TIME_ZONE),
        truncated: adminEmails.truncated,
      } : {
        unavailable: true,
        days: RETENTION_DAYS.deliveryOutcome,
        zone: dayZoneSentence(APP_TIME_ZONE),
      }}
    />
  )
}

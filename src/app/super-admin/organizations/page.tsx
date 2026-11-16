import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import OrgsManager from "@/components/super-admin/OrgsManager"
import { orgTimeZone } from "@/lib/time-zone"
import { ORG_SORT_COLS } from "@/lib/super-admin-tables"
import { parseSortParam } from "@/lib/table-sort"
import { ORG_ACCOUNT_ROLE_WHERE, OWNER_ROLE } from "@/lib/permissions"
import { localToday } from "@/lib/volunteer-hours"
import { loadLimitHits } from "@/lib/limit-hits-data"
import { zoneSentence } from "@/lib/limit-hits-view"
import { APP_TIME_ZONE } from "@/lib/time-zone"
import { eventActivity, eventActivityLabel, eventActivityRank, ownerActivation, ownerActivationLabel } from "@/lib/org-list-activity"
import { AUTO_APPROVAL_REVIEW_FILTER } from "@/lib/auto-approval"

export const dynamic = "force-dynamic"

export default async function SuperAdminOrgsPage({ searchParams }: { searchParams: Promise<{ tri?: string | string[]; filtre?: string | string[] }> }) {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const { tri, filtre } = await searchParams
  // The list's filter (#1371): spaces validated automatically and not reread yet. The sentence in
  // the list says so and « Voir tous les espaces » goes back to the full list.
  const reviewFilter = filtre === AUTO_APPROVAL_REVIEW_FILTER
  const orgs = await prisma.organization.findMany({
    where: reviewFilter ? { autoApprovedAt: { not: null }, autoApprovalReviewedAt: null } : undefined,
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
      autoApprovedAt: true,
      autoApprovalReviewedAt: true,
      createdAt: true,
      timeZone: true,
      // Activity at a glance (#1078): every event's days, whatever its status, and the owner
      // accounts' activation (only the setup link's expiry, never the link).
      events: { select: { startDate: true, endDate: true } },
      admins: { where: { role: OWNER_ROLE }, select: { isActive: true, setupTokenExpiresAt: true } },
      _count: {
        select: {
          events: true,
          // The administrators as before (#1142): a front-desk account is not one of them.
          admins: { where: ORG_ACCOUNT_ROLE_WHERE },
          volunteers: true,
        },
      },
    },
  })

  const now = new Date()
  // Sending limits reached lately (#1100): the block above the list and each row's marker.
  const limitHits = await loadLimitHits({ now })

  return (
    <OrgsManager
      initialSort={parseSortParam(tri, ORG_SORT_COLS)}
      filter={reviewFilter}
      limitHits={limitHits.groups}
      limitHitsTruncated={limitHits.truncated}
      limitHitsZone={zoneSentence(APP_TIME_ZONE)}
      initialOrgs={orgs.map(({ timeZone, events, admins, ...o }) => {
        const zone = orgTimeZone({ timeZone })
        const today = localToday(now, zone)
        const owner = ownerActivation(admins, now)
        const activity = eventActivity(events.map((e) => ({ startDate: e.startDate.toISOString().slice(0, 10), endDate: e.endDate.toISOString().slice(0, 10) })), today)
        return {
          ...o,
          // Computed here, with one « now »: the label and the sort key always agree.
          activityLabel: eventActivityLabel(activity, today),
          activityRank: eventActivityRank(activity, today),
          ownerLabel: ownerActivationLabel(owner, now, zone),
          ownerAlert: owner.kind === "expired" || owner.kind === "none",
          createdAt: o.createdAt.toISOString(),
          // Formatted here, in the organisation's zone: the same text on the server and in the browser.
          createdLabel: o.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: zone }),
          suspendedAt: o.suspendedAt?.toISOString() ?? null,
          publicationApprovedAt: o.publicationApprovedAt?.toISOString() ?? null,
          outboundEmailApprovedAt: o.outboundEmailApprovedAt?.toISOString() ?? null,
          autoApprovedAt: o.autoApprovedAt?.toISOString() ?? null,
          autoApprovalReviewedAt: o.autoApprovalReviewedAt?.toISOString() ?? null,
        }
      })}
    />
  )
}

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { hasLevel } from "@/lib/permissions"
import { canPublish as orgCanPublish } from "@/lib/org-approval"
import { isUnlistedPublic } from "@/lib/event-visibility"
import { currentStage, LIFECYCLE_STAGES, type StageId } from "@/lib/event-lifecycle"
import { eventDatesLabel } from "@/lib/event-nav"
import { localDay } from "@/lib/day-of"
import { orgTimeZone } from "@/lib/time-zone"
import EventHeader from "@/components/admin/event-nav/EventHeader"
import AnnounceProvider from "@/components/admin/AnnounceProvider"

export const dynamic = "force-dynamic"

const STAGE_CLASS: Record<StageId, string> = {
  draft: "bg-gray-100 text-gray-700",
  ready: "bg-gray-100 text-gray-800",
  published: "bg-green-100 text-green-800",
  finished: "bg-gray-100 text-gray-700",
  archived: "bg-yellow-100 text-yellow-800",
}

// Each page's own title (« Créneaux ») followed by the event's: what the route announcer reads
// after a tab, now that the pages' headings no longer repeat the event.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const ctx = await getOrgContext()
  const { id } = await params
  const event = ctx ? await ctx.db.event.findFirst({ where: { id }, select: { title: true } }) : null
  return event ? { title: { default: event.title, template: `%s – ${event.title}` } } : {}
}

/** Every page of an event: its header (title, stage, dates, primary action, « ⋯ », tabs), then the page. */
export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params

  const event = await ctx.db.event.findFirst({
    where: { id },
    select: {
      id: true, title: true, startDate: true, endDate: true, location: true, publicStatus: true, isListed: true, availabilityEnabled: true, availabilityAdoptedAt: true,
      organization: { select: { timeZone: true, publicationApprovedAt: true } },
      _count: { select: { shifts: { where: { status: { not: "cancelled" } } } } },
    },
  })
  if (!event) notFound()

  const startDate = event.startDate.toISOString().slice(0, 10)
  const endDate = event.endDate.toISOString().slice(0, 10)
  // « Terminé » and « Jour J » turn at midnight in the organisation's zone, not UTC.
  const today = localDay(new Date(), orgTimeZone(event.organization))
  const facts = {
    eventId: event.id, publicStatus: event.publicStatus, startDate, endDate, today,
    shiftCount: event._count.shifts, isListed: event.isListed,
  }
  const stage = currentStage({ ...facts, confirmationMessage: null, remindersEnabled: false })

  return (
    // One live region for the header's actions and the overview's « L'archiver » (#1098).
    <AnnounceProvider>
    <div className="space-y-6">
      <EventHeader
        facts={facts}
        title={event.title}
        dates={eventDatesLabel(startDate, endDate)}
        location={event.location}
        stage={{ label: LIFECYCLE_STAGES.find((s) => s.id === stage)!.label, className: STAGE_CLASS[stage] }}
        unlisted={isUnlistedPublic(event)}
        awaitingValidation={!orgCanPublish(event.organization)}
        // Permanent deletion is for owners (#469), once archived; the route refuses it otherwise too.
        canDelete={event.publicStatus === "archived" && hasLevel(ctx.session.user?.role, "owner")}
        availabilityPage={event.availabilityEnabled || !!event.availabilityAdoptedAt}
      />
      {children}
    </div>
    </AnnounceProvider>
  )
}

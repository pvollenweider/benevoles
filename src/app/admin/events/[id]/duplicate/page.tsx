// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import DuplicateEventForm from "@/components/admin/DuplicateEventForm"
import { deletedPosteNames, leadersOutsideDeletedPostes } from "@/lib/leader-postes"
import HelpLink from "@/components/admin/HelpLink"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Dupliquer l'événement" }


/** Duplication with explicit choices (#378): the form knows what the source holds before the organizer decides. */
export default async function DuplicateEventPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const event = await ctx.db.event.findFirst({
    where: { id },
    select: {
      id: true, title: true, startDate: true, publicInstructions: true, confirmationMessage: true, reminderMessage: true,
      _count: { select: { shifts: { where: { status: { not: "cancelled" } } }, pages: true } },
      // A copy leaves out the leaders of a deleted poste, every shift cancelled (#1010): the count says so.
      shifts: { select: { roleName: true, status: true }, distinct: ["roleName", "status"] },
      sectorLeaders: { select: { roleName: true } },
    },
  })
  if (!event) notFound()
  const leadersTaken = leadersOutsideDeletedPostes(event.sectorLeaders, deletedPosteNames(event.shifts)).length

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Dupliquer l&apos;événement</h1>
        <HelpLink route="/admin/events/[id]/duplicate" />
        <p className="text-sm text-gray-700 mt-1">Repartez de « {event.title} » pour une nouvelle édition : choisissez les dates et ce qui suit. Les inscriptions ne sont jamais copiées.</p>
      </div>
      <DuplicateEventForm
        eventId={event.id}
        sourceTitle={event.title}
        sourceStart={event.startDate.toISOString().slice(0, 10)}
        counts={{
          shifts: event._count.shifts,
          pages: event._count.pages,
          leaders: leadersTaken,
          leadersLeftOut: event.sectorLeaders.length - leadersTaken,
          hasSettings: Boolean(event.publicInstructions || event.confirmationMessage || event.reminderMessage),
        }}
      />
    </div>
  )
}

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import Link from "next/link"
import HelpLink from "@/components/admin/HelpLink"
import AvailabilityManager from "@/components/admin/AvailabilityManager"
import { loadAvailabilityOverview } from "@/lib/event-availability-server"
import { answersOpen, organiserDeadlineSentence } from "@/lib/event-availability-text"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Disponibilités" }

/**
 * « Disponibilités » (#1146, beta): who was asked, where each answer stands, the requests and the
 * reminders, and the organisers' corrections. Only for an event that uses the option.
 */
export default async function EventAvailabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx
  const { id } = await params
  const event = await db.event.findFirst({ where: { id }, select: { id: true, availabilityEnabled: true, availabilityAdoptedAt: true, availabilityDeadline: true } })
  if (!event || (!event.availabilityEnabled && !event.availabilityAdoptedAt)) notFound()
  const [overview, members] = await Promise.all([
    loadAvailabilityOverview(db, id),
    db.volunteer.findMany({ where: { active: true, erasedAt: null, mergedIntoId: null }, select: { id: true, firstName: true, lastName: true, email: true, tags: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
  ])
  if (!overview) notFound()
  const open = answersOpen(event.availabilityDeadline)
  const allTags = [...new Set(members.flatMap((m) => m.tags))].sort()

  return (
    <div className="space-y-5">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Disponibilités</h1>
        <HelpLink route="/admin/events/[id]/availability" />
        <p className="text-sm text-gray-700 mt-1">
          Pour placer des personnes sur un créneau selon leurs réponses :{" "}
          <Link href={`/admin/events/${id}/availability/assign`} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Affecter selon les disponibilités</Link>
        </p>
      </div>
      <AvailabilityManager
        eventId={id}
        enabled={event.availabilityEnabled}
        open={open}
        deadlineSentence={organiserDeadlineSentence(event.availabilityDeadline, open, overview.timeZone)}
        overview={overview}
        members={members}
        allTags={allTags}
      />
    </div>
  )
}

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { fmtRange } from "@/lib/gantt-utils"
import { audienceFromQuery } from "@/lib/targeted-message"
import TargetedMessageForm from "@/components/admin/TargetedMessageForm"
import MessageHistory from "@/components/admin/messages/MessageHistory"
import { loadMessageHistory } from "@/lib/message-history-data"
import { orgTimeZone } from "@/lib/time-zone"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Écrire aux bénévoles" }

const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })

/** « Écrire aux bénévoles » (#396): one message to the event, a role, a shift or the waitlist. */
export default async function MessagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ shift?: string; role?: string; audience?: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const q = await searchParams

  const event = await ctx.db.event.findFirst({
    where: { id },
    select: {
      id: true, title: true,
      organization: { select: { timeZone: true } },
      shifts: {
        where: { status: { not: "cancelled" } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true },
      },
    },
  })
  if (!event) notFound()
  const history = await loadMessageHistory(ctx.db, ctx.organizationId, event.id)

  const roles = Array.from(new Set(event.shifts.map((s) => s.roleName)))
  const shifts = event.shifts.map((s) => ({
    id: s.id,
    roleName: s.roleName,
    name: `${s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName} — ${day(s.date)}, ${fmtRange(s.startTime, s.endTime)}`,
  }))
  const initial = audienceFromQuery(q)
  // A prefilled shift or role that no longer exists falls back to everyone.
  const valid =
    (initial.kind === "shift" && shifts.some((s) => s.id === initial.shiftId)) ||
    (initial.kind === "role" && roles.includes(initial.roleName)) ||
    initial.kind === "event" || initial.kind === "waitlist" || initial.kind === "invited_without_shift"

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={`/admin/events/${event.id}`} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <span aria-hidden="true">← </span>Retour à {event.title}
        </Link>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 mt-1 focus:outline-none">Écrire aux bénévoles</h1>
        <p className="text-sm text-gray-700 mt-1">
          Un email, à qui c&apos;est utile : tous les inscrits, un poste, un créneau, la liste d&apos;attente, ou les membres invités qui n&apos;ont pas encore de créneau confirmé (ils reçoivent leur lien d&apos;invitation). Chaque personne le reçoit une fois, avec ses créneaux concernés et le lien vers ses inscriptions.
        </p>
      </div>
      <TargetedMessageForm eventId={event.id} roles={roles} shifts={shifts} initialAudience={valid ? initial : { kind: "event" }} />
      <p className="text-sm text-gray-600">
        Pour renvoyer leur lien d&apos;invitation aux membres invités sans créneau confirmé, utilisez « Relancer les … sans créneau » dans{" "}
        <Link href={`/admin/events/${event.id}/invitations`} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">les invitations</Link>.
      </p>
      <MessageHistory eventId={event.id} items={history} timeZone={orgTimeZone(event.organization)} />
    </div>
  )
}

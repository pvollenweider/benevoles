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
import ScheduledMessages from "@/components/admin/messages/ScheduledMessages"
import SendBatchList from "@/components/admin/messages/SendBatchList"
import { loadSendBatches } from "@/lib/send-batches-data"
import { loadMessageHistory, loadScheduledMessages } from "@/lib/message-history-data"
import { orgTimeZone } from "@/lib/time-zone"
import HelpLink from "@/components/admin/HelpLink"
import AutomaticRemindersBox from "@/components/admin/AutomaticRemindersBox"
import SendReminderButton from "@/components/admin/SendReminderButton"
import { remindersSummary } from "@/lib/automatic-reminders"
import { parseNotificationSettings } from "@/lib/notification-settings"
import { hasUpcomingShift } from "@/lib/event-wizard"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Communication" }

const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })

/**
 * « Communication »: « Écrire aux bénévoles » (#396), one message to the event, a role, a shift or
 * the waitlist, now or on a chosen date and time (#1019); the automatic reminders (#705) and the
 * manual reminder; the scheduled messages (#1019), every batch of emails (#1101) and the messages
 * sent (#467).
 */
export default async function MessagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ shift?: string; role?: string; audience?: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const q = await searchParams

  const event = await ctx.db.event.findFirst({
    where: { id },
    select: {
      id: true, title: true, publicStatus: true, remindersEnabled: true, reminderMessage: true, reminderSentAt: true,
      organization: { select: { timeZone: true, notificationSettings: true } },
      shifts: {
        where: { status: { not: "cancelled" } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true },
      },
    },
  })
  if (!event) notFound()
  const timeZone = orgTimeZone(event.organization)
  const history = await loadMessageHistory(ctx.db, ctx.organizationId, event.id)
  const scheduled = await loadScheduledMessages(ctx.db, event.id, timeZone, new Date())
  // Every batch of emails of the event (#1101), with its delivery.
  const batches = await loadSendBatches(ctx.organizationId, { eventId: event.id })
  // One reminder email per person: the unique volunteers with a confirmed shift.
  const confirmed = await ctx.db.registration.findMany({
    where: { eventId: event.id, status: "active", shift: { status: { not: "cancelled" } } },
    select: { volunteerId: true },
    distinct: ["volunteerId"],
  })
  // What the reminders cron will actually send for this event (#705), as on the review page (#565).
  const reminders = remindersSummary({
    eventId: event.id,
    published: event.publicStatus === "published",
    eventEnabled: event.remindersEnabled,
    organization: parseNotificationSettings(event.organization.notificationSettings).reminders,
    upcomingShifts: hasUpcomingShift(event.shifts.map((s) => ({ date: s.date.toISOString().slice(0, 10), startTime: s.startTime })), new Date(), timeZone),
  })
  const templates = await ctx.db.messageTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, subject: true, body: true } })

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
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Communication</h1>
        <HelpLink route="/admin/events/[id]/message" />
      </div>
      <section aria-labelledby="message-write" className="space-y-4">
        <div>
          <h2 id="message-write" className="text-base font-semibold text-gray-900">Écrire aux bénévoles</h2>
          <p className="text-sm text-gray-700 mt-1">
            Un email, à qui c&apos;est utile : tous les inscrits, un poste, un créneau, la liste d&apos;attente, ou les membres invités qui n&apos;ont pas encore de créneau confirmé (ils reçoivent leur lien d&apos;invitation). Chaque personne le reçoit une fois, avec ses créneaux concernés et le lien vers ses inscriptions.
          </p>
        </div>
      <TargetedMessageForm eventId={event.id} roles={roles} shifts={shifts} initialAudience={valid ? initial : { kind: "event" }} templates={templates} timeZone={timeZone} canSchedule={event.publicStatus !== "archived"} />
      <p className="text-sm text-gray-600">
        Pour renvoyer leur lien d&apos;invitation aux membres invités sans créneau confirmé, utilisez « Relancer les … sans créneau » dans{" "}
        <Link href={`/admin/events/${event.id}/invitations`} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">les invitations</Link>.
      </p>
      </section>
      <section aria-labelledby="message-reminders" className="space-y-3">
        <h2 id="message-reminders" className="text-base font-semibold text-gray-900">Rappels</h2>
        <AutomaticRemindersBox summary={reminders} />
        <SendReminderButton
          eventId={event.id}
          hasMessage={!!event.reminderMessage?.trim()}
          volunteerCount={confirmed.length}
          lastSentAt={event.reminderSentAt?.toISOString() ?? null}
        />
      </section>
      <ScheduledMessages eventId={event.id} items={scheduled} timeZone={timeZone} />
      <SendBatchList items={batches} timeZone={timeZone} messageIds={new Set(history.map((m) => m.id))} />
      <MessageHistory eventId={event.id} items={history} timeZone={timeZone} />
    </div>
  )
}

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { pickShiftInfo, withDayContact, withSectorLeaders } from "@/lib/shift-info"
import { parseNotificationSettings, reminderEnabled } from "@/lib/notification-settings"
import { recordJobRun } from "@/lib/job-runs"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { promoteNextInWaitlist, reconcileWaitlists } from "@/lib/waitlist"
import { sendPushToVolunteer } from "@/lib/push"
import { reportError } from "@/lib/report-error"
import { deliverOutbox, outboxHealth } from "@/lib/notifications/outbox"
import * as Sentry from "@sentry/nextjs"
import { registrationToken } from "@/lib/token-vault"
import { orgTimeZone } from "@/lib/time-zone"
import { remindersDue, type GroupableRegistration } from "@/lib/reminder-groups"

export const dynamic = "force-dynamic"

// Auth: any caller must present `Authorization: Bearer <CRON_SECRET>`.
// In dev, if CRON_SECRET is unset we allow localhost requests so a manual
// `curl http://localhost:3000/api/cron/reminders` works for testing.
function isAuthorized(req: Request): boolean {
  const expected = env.CRON_SECRET
  if (expected) return req.headers.get("authorization") === `Bearer ${expected}`
  // No secret configured: fail-closed in production, allow localhost in dev.
  if (process.env.NODE_ENV === "production") return false
  const host = req.headers.get("host") ?? ""
  return host.startsWith("localhost") || host.startsWith("127.0.0.1")
}

type Window = { kind: "reminder_j2" | "reminder_j1" | "reminder_dd"; field: "reminderJ2Sent" | "reminderJ1Sent" | "reminderDdSent"; minHours: number; maxHours: number }

const WINDOWS: Window[] = [
  { kind: "reminder_j2", field: "reminderJ2Sent", minHours: 47, maxHours: 49 },
  { kind: "reminder_j1", field: "reminderJ1Sent", minHours: 23, maxHours: 25 },
  { kind: "reminder_dd", field: "reminderDdSent", minHours: 2,  maxHours: 4 },
]

export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return recordJobRun("reminders", async () => {

  const now = new Date()
  const totals: Record<string, { eligible: number; groups: number; sent: number; failed: number }> = {}

  for (const win of WINDOWS) {
    const lower = new Date(now.getTime() + win.minHours * 3600 * 1000)
    const upper = new Date(now.getTime() + win.maxHours * 3600 * 1000)

    // Pull every active registration that has not received this reminder yet. The window is
    // computed on the candidate set in JS (cheap with index + status filter), per *group*
    // (#672): several shifts of the same volunteer, event and local day are sent as one email,
    // triggered once the earliest of them enters the window — see groupRemindersByDay.
    const candidates = await prisma.registration.findMany({
      where: {
        status: "active",
        [win.field]: null,
        event: { remindersEnabled: true, publicStatus: "published" },
        shift: { status: { not: "cancelled" } },
      },
      include: {
        volunteer: true,
        shift: true,
        event: { include: { organization: { select: { name: true, slug: true, timeZone: true, notificationSettings: true } }, sectorLeaders: { select: { roleName: true, name: true } } } },
      },
    })

    // The organization may have switched this reminder off (#381), per registration's own event.
    const eligible = candidates.filter((r) =>
      reminderEnabled(parseNotificationSettings(r.event.organization.notificationSettings), win.kind),
    )

    const triggered = remindersDue(eligible as (typeof eligible[number] & GroupableRegistration)[], (r) => orgTimeZone(r.event.organization), lower, upper)

    let eligibleShifts = 0
    let sent = 0
    let failed = 0
    for (const group of triggered) {
      eligibleShifts += group.registrations.length
      const [first] = group.registrations
      const shifts = group.registrations.map((r) => ({
        label: r.shift.label,
        roleName: r.shift.roleName,
        date: r.shift.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
        // The event's day-of contact (#560) when the shift has none, and the role's sector leaders
        // by name: reminders go to confirmed volunteers only.
        ...withSectorLeaders(withDayContact(pickShiftInfo(r.shift, r.event), r.event), r.shift.roleName, r.event.sectorLeaders),
      }))
      const result = await sendNotification({
        kind: win.kind,
        recipient: { email: first.volunteer.email, name: first.volunteer.firstName },
        volunteerId: first.volunteerId,
        organizationId: first.event.organizationId,
        data: {
          volunteerName: first.volunteer.firstName,
          eventTitle: first.event.title,
          organizationName: first.event.organization.name,
          orgSlug: first.event.organization.slug,
          shifts,
          // Any registration's token of this volunteer+event opens the same personal page,
          // listing every one of their shifts for the event (src/app/api/public/registrations).
          editToken: registrationToken.reveal(first),
          hoursUntil: Math.max(0, Math.round((group.earliestStart.getTime() - now.getTime()) / (3600 * 1000))),
        },
      })
      if (result.ok) {
        // Every shift of the group is marked in the same pass: a later run never re-sends any of
        // them, and a send that failed (below) leaves all of them unmarked, so the whole group is
        // retried together next time (#672).
        await prisma.registration.updateMany({
          where: { id: { in: group.registrations.map((r) => r.id) } },
          data: { [win.field]: now },
        })
        const hoursLabel =
          win.kind === "reminder_j2" ? "dans 2 jours" :
          win.kind === "reminder_j1" ? "demain" : "aujourd'hui"
        const body = group.registrations.length === 1
          ? `Rappel : votre créneau "${first.shift.label}" commence ${hoursLabel}.`
          : `Rappel : vos ${group.registrations.length} créneaux commencent ${hoursLabel}.`
        sendPushToVolunteer(first.volunteerId, {
          title: first.event.title,
          body,
          url: `/my/${registrationToken.reveal(first)}`,
          tag: `reminder-group-${first.volunteerId}-${first.eventId}-${group.localDay}-${win.kind}`,
        }).catch(reportError("push.reminder"))
        sent++
      } else {
        failed++
      }
    }

    totals[win.kind] = { eligible: eligibleShifts, groups: triggered.length, sent, failed }
  }

  // Expire offered waitlist spots and promote next in line
  const expiredOffers = await prisma.registration.findMany({
    where: {
      status: "offered",
      waitingExpiresAt: { lt: now },
    },
    select: { id: true, shiftId: true },
  })

  for (const reg of expiredOffers) {
    // Conditional (#264): the volunteer may have confirmed between the read above and now.
    const { count } = await prisma.registration.updateMany({
      where: { id: reg.id, status: "offered", waitingExpiresAt: { lt: now } },
      data: { status: "cancelled" },
    })
    if (count === 0) continue
    await promoteNextInWaitlist(reg.shiftId).catch(reportError("waitlist.promote"))
  }

  // Catch up on promotions that failed after a cancellation: a free spot with people waiting.
  const waitlist = await reconcileWaitlists(now).catch((e) => {
    reportError("waitlist.reconcile")(e)
    return null
  })

  // Retry notifications whose immediate delivery failed (outbox, #293).
  const outbox = await deliverOutbox().catch((e) => {
    reportError("outbox.cron_deliver")(e)
    return null
  })
  // Queue health (#316): alert when something is stuck or gave up.
  const outboxStatus = await outboxHealth(now).catch((e) => {
    reportError("outbox.health")(e)
    return null
  })
  if (outboxStatus && !outboxStatus.healthy) {
    Sentry.captureMessage("Notification outbox unhealthy", { level: "warning", extra: { ...outboxStatus } })
  }

  return NextResponse.json({
    runAt: now.toISOString(),
    totals,
    expiredOffers: expiredOffers.length,
    waitlist,
    outbox,
    outboxStatus,
  })
  })
}

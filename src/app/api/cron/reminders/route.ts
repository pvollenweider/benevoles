import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import type { NotificationKind } from "@/lib/notifications"

export const dynamic = "force-dynamic"

// Auth: any caller must present `Authorization: Bearer <CRON_SECRET>`.
// In dev, if CRON_SECRET is unset we allow localhost requests so a manual
// `curl http://localhost:3000/api/cron/reminders` works for testing.
function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (expected) {
    return auth === `Bearer ${expected}`
  }
  // No secret configured → only allow on localhost (dev mode).
  const host = req.headers.get("host") ?? ""
  return host.startsWith("localhost") || host.startsWith("127.0.0.1")
}

type Window = { kind: NotificationKind; field: "reminderJ2Sent" | "reminderJ1Sent" | "reminderDdSent"; minHours: number; maxHours: number }

const WINDOWS: Window[] = [
  { kind: "reminder_j2", field: "reminderJ2Sent", minHours: 47, maxHours: 49 },
  { kind: "reminder_j1", field: "reminderJ1Sent", minHours: 23, maxHours: 25 },
  { kind: "reminder_dd", field: "reminderDdSent", minHours: 2,  maxHours: 4 },
]

/**
 * Combines a Shift.date (calendar day) with its startTime ("HH:MM") into
 * a real timestamp. Stored times are local strings; we treat them as UTC
 * which is fine for relative windows.
 */
function shiftStartAt(date: Date, startTime: string): Date {
  const [h, m] = startTime.split(":").map(Number)
  const d = new Date(date)
  d.setUTCHours(h ?? 0, m ?? 0, 0, 0)
  return d
}

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

  const now = new Date()
  const totals: Record<string, { eligible: number; sent: number; failed: number }> = {}

  for (const win of WINDOWS) {
    const lower = new Date(now.getTime() + win.minHours * 3600 * 1000)
    const upper = new Date(now.getTime() + win.maxHours * 3600 * 1000)

    // Pull every active registration that has not received this reminder
    // yet AND whose shift starts inside the [lower, upper] window. The
    // window is computed on the candidate set in JS (cheap with index +
    // status filter).
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
        event: { include: { organization: { select: { name: true } } } },
      },
    })

    const inWindow = candidates.filter((r) => {
      const start = shiftStartAt(r.shift.date, r.shift.startTime)
      return start >= lower && start <= upper
    })

    let sent = 0
    let failed = 0
    for (const r of inWindow) {
      const start = shiftStartAt(r.shift.date, r.shift.startTime)
      const result = await sendNotification({
        kind: win.kind,
        recipient: { email: r.volunteer.email, name: r.volunteer.firstName },
        data: {
          volunteerName: r.volunteer.firstName,
          eventTitle: r.event.title,
          organizationName: r.event.organization.name,
          shiftLabel: r.shift.label,
          shiftRoleName: r.shift.roleName,
          shiftDate: r.shift.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
          shiftStart: r.shift.startTime,
          shiftEnd: r.shift.endTime,
          shiftLocation: r.shift.locationDetails,
          editToken: r.editToken,
          hoursUntil: Math.max(0, Math.round((start.getTime() - now.getTime()) / (3600 * 1000))),
        },
      })
      if (result.ok) {
        await prisma.registration.update({
          where: { id: r.id },
          data: { [win.field]: now },
        })
        sent++
      } else {
        failed++
      }
    }

    totals[win.kind] = { eligible: inWindow.length, sent, failed }
  }

  return NextResponse.json({
    runAt: now.toISOString(),
    totals,
  })
}

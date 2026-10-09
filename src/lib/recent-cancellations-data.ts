// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { OCCUPYING_STATUSES } from "./registration-capacity"
import { recentCancellations, type RecentCancellation } from "./registration-restore"
import { spokenShift } from "./spoken-time"
import { localDateTimeToUtc } from "./time-zone"

/** At most this many cancelled rows are read: the list is about recent mistakes. */
const READ_LIMIT = 200

/**
 * The « Annulations récentes » of an event (#809), read through the organisation's own client:
 * cancelled registrations on shifts not cancelled and not past, with their latest cancellation
 * entry, and what decides whether the spot is still free. Server only.
 */
export async function loadRecentCancellations(db: OrgScopedPrisma, eventId: string, timeZone: string, now: Date = new Date()): Promise<RecentCancellation[]> {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const cancelled = await db.registration.findMany({
    where: { eventId, status: "cancelled", shift: { status: { not: "cancelled" }, date: { gte: yesterday } } },
    select: {
      id: true, volunteerId: true, shiftId: true,
      volunteer: { select: { firstName: true, lastName: true, email: true } },
      shift: { select: { roleName: true, label: true, date: true, startTime: true, endTime: true, status: true, capacity: true } },
    },
    orderBy: { createdAt: "desc" },
    take: READ_LIMIT,
  })
  if (cancelled.length === 0) return []

  const shiftIds = [...new Set(cancelled.map((r) => r.shiftId))]
  const [logs, live] = await Promise.all([
    db.eventLog.findMany({
      where: { eventId, entityType: "Registration", action: "registration.cancelled", entityId: { in: cancelled.map((r) => r.id) } },
      orderBy: { createdAt: "desc" },
      select: { entityId: true, actorType: true, changes: true, createdAt: true },
    }),
    db.registration.findMany({
      where: { shiftId: { in: shiftIds }, status: { in: ["active", "waiting", "offered", "requested"] } },
      select: { shiftId: true, volunteerId: true, status: true },
    }),
  ])
  const latest = new Map<string, (typeof logs)[number]>()
  for (const l of logs) if (!latest.has(l.entityId)) latest.set(l.entityId, l)
  const occupying = new Set<string>(OCCUPYING_STATUSES)

  return recentCancellations(cancelled.map((r) => {
    const log = latest.get(r.id)
    return {
      id: r.id,
      volunteerName: `${r.volunteer.firstName} ${r.volunteer.lastName}`,
      hasEmail: !!r.volunteer.email,
      shift: spokenShift({ ...r.shift, date: r.shift.date.toISOString().slice(0, 10) }),
      shiftStatus: r.shift.status,
      shiftStart: localDateTimeToUtc(r.shift.date, r.shift.startTime, timeZone),
      capacity: r.shift.capacity,
      occupied: live.filter((l) => l.shiftId === r.shiftId && occupying.has(l.status)).length,
      liveAgainOnShift: live.some((l) => l.shiftId === r.shiftId && l.volunteerId === r.volunteerId),
      cancellation: log ? { actorType: log.actorType, at: log.createdAt, changes: log.changes } : null,
    }
  }), now, timeZone)
}

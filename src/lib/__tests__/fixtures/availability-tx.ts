// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { vi } from "vitest"

/**
 * The parts of a transaction client the availability guard reads (#1146, lot B), for unit tests of
 * the organiser actions: the event's option, the shifts' hours, each person's answer, and the log
 * entries it writes. Events from 10 to 12 July 2030, zone Europe/Zurich; by default every answer
 * gives the 10th and the 11th, free only 09:00–12:00 on the 11th.
 */
export const AVAILABILITY_EVENT = {
  startDate: new Date("2030-07-10T00:00:00Z"), endDate: new Date("2030-07-12T00:00:00Z"),
  availabilityEnabled: true, availabilityAdoptedAt: new Date("2030-06-01T00:00:00Z"), availabilityTimeZone: "Europe/Zurich", organization: { timeZone: "Europe/Zurich" },
}

export const answerRow = (volunteerId: string, revision = 2, requestId = `req-${volunteerId}`) => ({
  id: requestId, volunteerId, revision, reviewReason: null,
  days: [
    { date: new Date("2030-07-10T00:00:00Z"), ranges: [] },
    { date: new Date("2030-07-11T00:00:00Z"), ranges: [{ startTime: "09:00", endTime: "12:00", startsAt: new Date("2030-07-11T07:00:00Z"), endsAt: new Date("2030-07-11T10:00:00Z") }] },
  ],
})

/** A shift of the 11th, `start`–`end` local time. */
export const availabilityShift = (id: string, start = "14:00", end = "20:00") => ({ id, roleName: "Bar", label: "Soir", date: new Date("2030-07-11T00:00:00Z"), startTime: start, endTime: end })

export function availabilityTx(o: { inUse?: boolean; answers?: Record<string, ReturnType<typeof answerRow> | null>; shifts?: ReturnType<typeof availabilityShift>[] } = {}) {
  const shifts = o.shifts ?? []
  return {
    event: { findFirst: vi.fn(async () => (o.inUse === false ? { ...AVAILABILITY_EVENT, availabilityEnabled: false, availabilityAdoptedAt: null } : AVAILABILITY_EVENT)) },
    shiftRows: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => shifts.filter((s) => where.id.in.includes(s.id))) },
    availabilityRequest: { findFirst: vi.fn(async ({ where }: { where: { volunteerId: string } }) => o.answers?.[where.volunteerId] ?? null) },
    eventLog: { create: vi.fn(async () => ({ id: "ack-log" })) },
  }
}

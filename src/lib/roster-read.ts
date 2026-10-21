// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { buildShiftRoster, isRosterChoice, type RosterAudience, type ShiftRosterEntry, type StoredRosterChoice } from "./shift-roster"

/**
 * The reads of a shift roster (#1068), server-only, shared by the personal link's route and the
 * invitation's: every shift of the event, its confirmed registrations and the shown choices, given
 * to buildShiftRoster with the viewer's audience. The callers check who is asking first.
 */
export async function loadShiftRoster(input: { eventId: string; viewerId: string; audience: RosterAudience; eventStart: Date }): Promise<ShiftRosterEntry[]> {
  const { eventId, viewerId, audience, eventStart } = input
  const [shifts, registrations, consents] = await Promise.all([
    // Every shift of the event (owner decision: choose shifts by affinity), its public fields only.
    prisma.shift.findMany({
      where: { eventId, status: { not: "cancelled" } },
      select: { id: true, label: true, date: true, startTime: true, endTime: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { displayOrder: "asc" }],
    }),
    prisma.registration.findMany({
      where: { eventId, status: "active" },
      select: {
        shiftId: true, volunteerId: true, status: true,
        volunteer: { select: { firstName: true, lastName: true, birthDate: true, erasedAt: true, mergedIntoId: true } },
      },
    }),
    prisma.rosterConsent.findMany({ where: { eventId, status: "visible" }, select: { volunteerId: true, status: true, noticeVersion: true } }),
  ])
  const choices = new Map<string, StoredRosterChoice>(
    consents.filter((c) => isRosterChoice(c.status)).map((c) => [c.volunteerId, { status: c.status as StoredRosterChoice["status"], noticeVersion: c.noticeVersion }]),
  )
  return buildShiftRoster({ viewerId, shifts, registrations, choices, audience, eventStart })
}

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { prisma } from "./prisma"
import { logEvent } from "./event-log"
import { ROSTER_NOTICE_VERSION, choiceAfterSignup, isRosterChoice, type RosterChoice, type RosterSource } from "./shift-roster"

/**
 * Writes of a volunteer's shift roster choice (#1068), server-only. The rules are in
 * src/lib/shift-roster.ts; this stores the result, one row per (event, volunteer), and says what
 * changed so the caller logs it (the grants and withdrawals history, in the event log).
 */

type Tx = Pick<Parameters<Parameters<typeof prisma.$transaction>[0]>[0], "rosterConsent">

export type RosterChange = { from: RosterChoice | null; to: RosterChoice }

async function storedChoice(tx: Tx, eventId: string, volunteerId: string): Promise<RosterChoice | null> {
  const row = await tx.rosterConsent.findUnique({ where: { eventId_volunteerId: { eventId, volunteerId } }, select: { status: true } })
  return row && isRosterChoice(row.status) ? row.status : null
}

async function store(tx: Tx, eventId: string, volunteerId: string, status: RosterChoice, source: RosterSource, now: Date) {
  const data = { status, source, noticeVersion: ROSTER_NOTICE_VERSION, decidedAt: now }
  await tx.rosterConsent.upsert({
    where: { eventId_volunteerId: { eventId, volunteerId } },
    create: { eventId, volunteerId, ...data },
    update: data,
  })
}

/** After a public sign-up, in its transaction: see choiceAfterSignup. Null when nothing changed. */
export async function applySignupRosterChoice(tx: Tx, input: { eventId: string; volunteerId: string; requested: boolean; verified: boolean; minor: boolean; now: Date }): Promise<RosterChange | null> {
  const { eventId, volunteerId, verified, now } = input
  const stored = await storedChoice(tx, eventId, volunteerId)
  const next = choiceAfterSignup({ stored, requested: input.requested, verified, minor: input.minor })
  if (next === null || next === stored) return null
  await store(tx, eventId, volunteerId, next, verified ? "signup_verified" : "signup", now)
  return { from: stored, to: next }
}

/** From the personal page (its link proves the address): visible or hidden. Null when unchanged. */
export async function setPersonalRosterChoice(tx: Tx, input: { eventId: string; volunteerId: string; visible: boolean; now: Date }): Promise<RosterChange | null> {
  const { eventId, volunteerId, now } = input
  const stored = await storedChoice(tx, eventId, volunteerId)
  const next: RosterChoice = input.visible ? "visible" : "hidden"
  if (next === stored) return null
  await store(tx, eventId, volunteerId, next, "personal_page", now)
  return { from: stored, to: next }
}

/** The history line of a change, by the volunteer themself. */
export function logRosterChange(eventId: string, volunteerId: string, change: RosterChange) {
  return logEvent({
    eventId,
    actor: { type: "volunteer", id: volunteerId },
    action: "roster.choice_changed",
    // About the event's roster; the actor names the volunteer (resolved at read time).
    entityType: "Event",
    entityId: eventId,
    changes: { rosterName: { from: change.from, to: change.to } },
  })
}

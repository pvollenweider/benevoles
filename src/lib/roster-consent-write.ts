// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { prisma } from "./prisma"
import { logEvent } from "./event-log"
import {
  isRosterChoice, noticeReaches, rosterAfterSignup,
  type RosterSource, type StoredRosterChoice,
} from "./shift-roster"

/**
 * Writes of a volunteer's shift roster choice (#1068), server-only. The rules are in
 * src/lib/shift-roster.ts; this stores the result, one row per (event, volunteer) with the version
 * of the text it was given under, and says what changed so the caller logs it (the grants,
 * widenings and withdrawals history, in the event log).
 */

type Tx = Pick<Parameters<Parameters<typeof prisma.$transaction>[0]>[0], "rosterConsent">

export type RosterChange = { from: StoredRosterChoice | null; to: StoredRosterChoice }

export async function storedRosterChoice(tx: Tx, eventId: string, volunteerId: string): Promise<StoredRosterChoice | null> {
  const row = await tx.rosterConsent.findUnique({ where: { eventId_volunteerId: { eventId, volunteerId } }, select: { status: true, noticeVersion: true } })
  return row && isRosterChoice(row.status) ? { status: row.status, noticeVersion: row.noticeVersion } : null
}

async function store(tx: Tx, eventId: string, volunteerId: string, choice: StoredRosterChoice, source: RosterSource, now: Date) {
  const data = { status: choice.status, noticeVersion: choice.noticeVersion, source, decidedAt: now }
  await tx.rosterConsent.upsert({
    where: { eventId_volunteerId: { eventId, volunteerId } },
    create: { eventId, volunteerId, ...data },
    update: data,
  })
}

/** After a public sign-up, in its transaction: see rosterAfterSignup. Null when nothing changed. */
export async function applySignupRosterChoice(tx: Tx, input: { eventId: string; volunteerId: string; requested: boolean; verified: boolean; minor: boolean; noticeVersion: string; now: Date }): Promise<RosterChange | null> {
  const { eventId, volunteerId, verified, now } = input
  const stored = await storedRosterChoice(tx, eventId, volunteerId)
  const next = rosterAfterSignup({ stored, requested: input.requested, verified, minor: input.minor, noticeVersion: input.noticeVersion })
  if (!next) return null
  await store(tx, eventId, volunteerId, next, verified ? "signup_verified" : "signup", now)
  return { from: stored, to: next }
}

/**
 * From the personal page (its link proves the address): shown under the text the page displayed
 * (`noticeVersion`, see signupNoticeVersion: a page loaded before the current text sends none and
 * counts as the first one), or hidden. Showing again a name shown under the first text, from a
 * page with the current one, records it (its wider audience). Null when unchanged.
 */
export async function setPersonalRosterChoice(tx: Tx, input: { eventId: string; volunteerId: string; visible: boolean; noticeVersion: string; now: Date }): Promise<RosterChange | null> {
  const { eventId, volunteerId, now } = input
  const stored = await storedRosterChoice(tx, eventId, volunteerId)
  const next: StoredRosterChoice = input.visible
    ? { status: "visible", noticeVersion: input.noticeVersion }
    : { status: "hidden", noticeVersion: stored?.noticeVersion ?? input.noticeVersion }
  if (stored && stored.status === next.status && (next.status === "hidden" || stored.noticeVersion === next.noticeVersion)) return null
  await store(tx, eventId, volunteerId, next, "personal_page", now)
  return { from: stored, to: next }
}

/** The audience a stored choice reaches, for the log: null when nobody sees the name. */
function audienceOf(choice: StoredRosterChoice | null): "confirmed" | "confirmed_and_invited" | null {
  if (choice?.status !== "visible") return null
  if (noticeReaches(choice.noticeVersion, "invited")) return "confirmed_and_invited"
  return noticeReaches(choice.noticeVersion, "confirmed") ? "confirmed" : null
}

/** The changed fields of a choice, for the log: its state, and who sees the name when that changes. */
export function rosterLogChanges(change: RosterChange): Record<string, { from: string | null; to: string | null }> {
  const changes: Record<string, { from: string | null; to: string | null }> = {}
  if ((change.from?.status ?? null) !== change.to.status) changes.rosterName = { from: change.from?.status ?? null, to: change.to.status }
  const before = audienceOf(change.from)
  const after = audienceOf(change.to)
  if (before !== after && before !== null && after !== null) changes.rosterAudience = { from: before, to: after }
  return changes
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
    changes: rosterLogChanges(change),
  })
}

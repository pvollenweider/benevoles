// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Server side of the shift share links (#1386): idempotent creation, the option's update, the
 * shape the admin panel reads and its sign-up counter. Reads and writes go through the caller's
 * org-scoped client (`db`), never the raw one.
 *
 * The code uses the group links' generator and uniqueness retry (src/lib/group-links-data.ts): one
 * code format, one collision handling. `shiftId` is unique, so two first clicks on « Partager ce
 * créneau » give the same link: the loser of the insert race reads the winner's row.
 */

import { isUniqueViolation, LIVE_STATUSES } from "@/lib/registration-capacity"
import { eventPublicUrl } from "@/lib/urls"
import { createWithUniqueCode } from "@/lib/group-links-data"
import { shiftShareLinkUrl, type AdminShiftLink } from "@/lib/shift-share-links"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type ShiftShareLinkRow = { id: string; shiftId: string; code: string; acceptsAfterClose: boolean }

export function toAdminShiftLink(link: ShiftShareLinkRow, publicUrl: string, registrations: number): AdminShiftLink {
  return {
    id: link.id,
    shiftId: link.shiftId,
    code: link.code,
    url: shiftShareLinkUrl(publicUrl, link.code),
    acceptsAfterClose: link.acceptsAfterClose,
    registrations,
  }
}

/** Live sign-ups a link brought (the statuses the event's figures count). */
export async function shiftShareLinkRegistrations(db: Db, eventId: string, linkId: string): Promise<number> {
  return db.registration.count({
    where: { eventId, shiftShareLinkId: linkId, status: { in: [...LIVE_STATUSES] } },
  })
}

/**
 * The shift's link, created on first use. Idempotent: an existing link for this shift is returned
 * as is, whatever `acceptsAfterClose` it holds. A concurrent first creation that hits the unique
 * `shiftId` reads the winner's row instead of failing.
 */
export async function ensureShiftShareLink(db: Db, event: { id: string; slug: string; organization: { slug: string } }, shiftId: string, createdById: string | null): Promise<{ link: ShiftShareLinkRow; created: boolean }> {
  const existing: ShiftShareLinkRow | null = await db.shiftShareLink.findFirst({
    where: { eventId: event.id, shiftId },
    select: { id: true, shiftId: true, code: true, acceptsAfterClose: true },
  })
  if (existing) return { link: existing, created: false }
  try {
    const link = await createWithUniqueCode<ShiftShareLinkRow>((code) =>
      db.shiftShareLink.create({
        data: { eventId: event.id, shiftId, code, createdById },
        select: { id: true, shiftId: true, code: true, acceptsAfterClose: true },
      }),
    )
    return { link, created: true }
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    // The unique `shiftId` (or a code, retried by createWithUniqueCode): the row now exists.
    const winner: ShiftShareLinkRow | null = await db.shiftShareLink.findFirst({
      where: { eventId: event.id, shiftId },
      select: { id: true, shiftId: true, code: true, acceptsAfterClose: true },
    })
    if (!winner) throw e
    return { link: winner, created: false }
  }
}

/** The admin panel's answer for a row, sign-ups included. */
export async function loadAdminShiftLink(db: Db, event: { id: string; slug: string; organization: { slug: string } }, link: ShiftShareLinkRow): Promise<AdminShiftLink> {
  return toAdminShiftLink(link, eventPublicUrl(event.organization.slug, event.slug), await shiftShareLinkRegistrations(db, event.id, link.id))
}

/** Non-personal log values (#1386): the option only, the shift is the entry's target. */
export function shiftShareLinkLogValues(l: { acceptsAfterClose: boolean }) {
  return { acceptsAfterClose: l.acceptsAfterClose }
}

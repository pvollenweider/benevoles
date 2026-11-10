// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The shared write of « Je ne peux pas » for one shift (#1303), and the handler the two public
 * POST routes delegate to. Never a GET: a mail scanner or a link preview must not answer for the
 * person. Rate limited per IP before any read, idempotent (two submits create one row and log it
 * once, through the unique index), and logged with the volunteer as actor, no personal data in
 * `changes` beyond the shift id.
 *
 * Server-only: imports the Prisma client. The two route files stay thin and only say which secret
 * carried the link.
 */

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "./prisma"
import { logEvent } from "./event-log"
import { orgUnavailableResponse } from "./org-lifecycle-response"
import { getClientIp, rateLimit } from "./rate-limit"
import { loadShiftDeclineTarget } from "./shift-decline-read"
import {
  SHIFT_DECLINE_RATE_LIMIT,
  shiftDeclineUnavailableMessage,
  type ShiftDeclineSecret,
} from "./shift-declines"

/** A handful of confirmations per hour is plenty for one real person; above that, token guessing. */
const SHIFT_DECLINE_PER_HOUR = 10
const HOUR = 60 * 60 * 1000

/**
 * Writes the answer once. `createManyAndReturn` with `skipDuplicates` is the idempotency: a double
 * submit returns no new row, so nothing is written and the journal entry is not repeated.
 */
export async function recordShiftDecline(input: { eventId: string; shiftId: string; volunteerId: string }): Promise<{ created: boolean }> {
  const rows = await prisma.shiftDecline.createManyAndReturn({
    data: [{ shiftId: input.shiftId, volunteerId: input.volunteerId }],
    skipDuplicates: true,
    select: { id: true },
  })
  if (rows.length === 0) return { created: false }

  await logEvent({
    eventId: input.eventId,
    actor: { type: "volunteer", id: input.volunteerId },
    action: "shiftdecline.declined",
    entityType: "ShiftDecline",
    entityId: rows[0].id,
    // No personal data: the shift id says which mission, nothing about who.
    changes: { shiftId: { from: null, to: input.shiftId } },
  })
  return { created: true }
}

/** POST shared by the invitation and the personal-link route. */
export async function postShiftDecline(
  req: Request,
  secret: ShiftDeclineSecret,
  token: string,
  shiftId: string,
): Promise<NextResponse> {
  // Before any read, like member-invite/[token]/decline (#558).
  const rl = await rateLimit(getClientIp(req), SHIFT_DECLINE_RATE_LIMIT[secret], SHIFT_DECLINE_PER_HOUR, HOUR)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const orgSlug = (await headers()).get("x-org-slug")
  const lookup = await loadShiftDeclineTarget({ secret, token, shiftId, orgSlug })
  // One answer for every refusal: unknown, revoked or foreign link (#541).
  if (lookup.kind === "invalid") return NextResponse.json({ error: "Lien invalide" }, { status: 404 })
  if (lookup.kind === "org_unavailable") return orgUnavailableResponse()

  const { target } = lookup
  if (target.state.kind === "declined") {
    return NextResponse.json({ success: true, already: true, state: "declined" })
  }
  // A cancelled, full, past or deleted shift, or one the member already holds: a clear answer,
  // nothing written, no error page.
  if (target.state.kind !== "open") {
    return NextResponse.json({
      success: false,
      state: target.state.kind,
      message: shiftDeclineUnavailableMessage(target.state),
    })
  }

  const result = await recordShiftDecline({
    eventId: target.eventId,
    shiftId: target.shiftId,
    volunteerId: target.volunteerId,
  })
  return NextResponse.json({ success: true, already: !result.created })
}

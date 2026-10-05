// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { validationError } from "@/lib/api-error"
import { mergeRequestSchema } from "@/lib/member-merge-schema"
import { runMemberMerge, MergeConflictError } from "@/lib/member-merge-transaction"
import { UnresolvedConflictsError } from "@/lib/member-merge"
import { registrationToken, linkToken } from "@/lib/token-vault"
import { sendNotification } from "@/lib/notifications"
import { sendMemberInvite } from "@/lib/notification-helpers"
import { reportError } from "@/lib/report-error"

/**
 * Executes a member merge (#600): one transaction (src/lib/member-merge-transaction.ts), then —
 * best effort, outside the transaction, like every other notification send in this codebase —
 * optionally emails the regenerated links to the kept address. A failure here never undoes the
 * merge: it already committed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard

  const { id: keepId } = await params
  const body = await req.json().catch(() => null)
  const parsed = mergeRequestSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)
  const { otherId: absorbId, choices } = parsed.data

  let result
  try {
    result = await runMemberMerge(db, organizationId, adminActor(session), keepId, absorbId, choices)
  } catch (e) {
    if (e instanceof MergeConflictError) return NextResponse.json({ error: e.message }, { status: e.status })
    if (e instanceof UnresolvedConflictsError) {
      return NextResponse.json({ error: "Des conflits doivent être résolus avant de confirmer la fusion.", conflicts: e.conflicts }, { status: 400 })
    }
    // Anything else thrown here comes from inside the transaction, which rolled back: say so in
    // words (the client otherwise read the HTML error page as a cut connection) and report it.
    reportError("member.merge")(e)
    return NextResponse.json({ error: "La fusion n'a pas pu être faite. Rien n'a été modifié.", notApplied: true }, { status: 500 })
  }

  let resend: { sent: number; failed: number } | null = null
  if (choices.sendLinksToKeptAddress) {
    resend = await sendMergedLinks(db, keepId, result.plan.tokenRegeneration)
  }

  return NextResponse.json({
    keepId: result.keepId,
    absorbId: result.absorbId,
    counts: {
      registrationsMoved: result.plan.registrationsToReassign.length,
      registrationsCancelled: result.plan.registrationsToCancel.length,
      invitesMoved: result.plan.inviteIdsToReassign.length,
      invitesDeleted: result.plan.inviteIdsToDelete.length,
      answersMoved: result.plan.answerIdsToReassign.length,
      answersDropped: result.plan.answerIdsToDrop.length,
      pushSubscriptionsDropped: result.plan.pushSubscriptionIdsToDelete.length,
      deliveryOutcomesReassigned: result.plan.deliveryOutcomeIdsToReassign.length,
      outboxCancelled: result.outboxCancelled,
    },
    tokensRegenerated: result.tokensRegenerated,
    resend,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendMergedLinks(db: any, keepId: string, moved: { registrationIds: string[]; inviteIds: string[] }): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0
  const keep = await db.volunteer.findFirst({ where: { id: keepId }, select: { firstName: true, lastName: true, email: true } })
  if (!keep?.email) return { sent, failed }
  const name = `${keep.firstName} ${keep.lastName}`

  if (moved.registrationIds.length) {
    const rows = await db.registration.findMany({
      where: { id: { in: moved.registrationIds } },
      select: { id: true, eventId: true, volunteerId: true, ...registrationToken.select, event: { select: { title: true, organizationId: true, organization: { select: { slug: true } } } } },
    })
    const byEvent = new Map<string, (typeof rows)[number]>()
    for (const r of rows) byEvent.set(r.eventId, r) // one email per event is enough
    for (const r of byEvent.values()) {
      try {
        const res = await sendNotification({
          kind: "registration_link_resend",
          recipient: { email: keep.email, name },
          volunteerId: keepId,
          organizationId: r.event.organizationId,
          data: { volunteerName: name, eventTitle: r.event.title, orgSlug: r.event.organization.slug, editToken: registrationToken.reveal(r) },
        })
        if (res.ok) sent++; else failed++
      } catch { failed++ }
    }
  }

  if (moved.inviteIds.length) {
    const rows = await db.memberInvite.findMany({
      where: { id: { in: moved.inviteIds } },
      select: {
        id: true, volunteerId: true, ...linkToken.select,
        event: { select: { title: true, slug: true, startDate: true, location: true, organizationId: true, organization: { select: { name: true, slug: true } } } },
      },
    })
    for (const i of rows) {
      try {
        const res = await sendMemberInvite({
          to: keep.email,
          memberName: keep.firstName,
          organizationName: i.event.organization.name,
          eventTitle: i.event.title,
          eventDate: i.event.startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
          eventLocation: i.event.location,
          orgSlug: i.event.organization.slug,
          eventSlug: i.event.slug,
          message: null,
          token: linkToken.reveal(i),
          volunteerId: keepId,
          organizationId: i.event.organizationId,
        })
        if (res.ok) sent++; else failed++
      } catch { failed++ }
    }
  }

  return { sent, failed }
}

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, diffFields, logOrgEvent } from "@/lib/org-log"
import { z } from "zod"
import { validationError } from "@/lib/api-error"
import { cappedText } from "@/lib/text-limits-schema"
import { MEMBER_NOTES_MAX } from "@/lib/text-limits"
import { availabilitySchema } from "@/lib/availability"
import { isUniqueViolation } from "@/lib/registration-capacity"
import { memberWriteRefusal } from "@/lib/member-erasure"
import { addressCorrected } from "@/lib/member-address-change"
import { SEND_TRANSACTION_OPTIONS } from "@/lib/invitation-sending"
import { renewMemberLinks } from "@/lib/member-address-revocation"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import type { Tx } from "@/lib/registration-capacity"

const EMAIL_TAKEN = "Un autre membre de l'organisation utilise déjà cette adresse email."

const patchSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: cappedText(MEMBER_NOTES_MAX, "Les notes").optional().nullable(),
  active: z.boolean().optional(),
  availabilityPeriods: availabilitySchema.shape.availabilityPeriods.optional(),
  availabilityNote: availabilitySchema.shape.availabilityNote.optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const before = await db.volunteer.findFirst({ where: { id } })
  if (!before) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  // An erased record (#516) stays empty, and a merge tombstone (#600) holds no data: personal data
  // can't be typed back into either.
  const tombstone = memberWriteRefusal(before)
  if (tombstone) return NextResponse.json({ error: tombstone }, { status: 409 })

  const data = parsed.data
  const updateData: Record<string, unknown> = {}
  if (data.firstName !== undefined) updateData.firstName = data.firstName
  if (data.lastName !== undefined) updateData.lastName = data.lastName
  if (data.email !== undefined) updateData.email = data.email || null
  if (data.phone !== undefined) updateData.phone = data.phone || null
  if (data.tags !== undefined) updateData.tags = data.tags
  if (data.notes !== undefined) updateData.notes = data.notes || null
  if (data.active !== undefined) updateData.active = data.active
  if (data.availabilityPeriods !== undefined) updateData.availabilityPeriods = data.availabilityPeriods
  if (data.availabilityNote !== undefined) updateData.availabilityNote = data.availabilityNote

  // Emails are unique per organisation (Volunteer_organizationId_email_key): answer a clean 409,
  // as member creation does, instead of letting the constraint surface as a 500. The check covers
  // the usual case; the catch covers a concurrent write taking the address in between.
  const newEmail = updateData.email as string | null | undefined
  if (newEmail && newEmail !== before.email) {
    const taken = await db.volunteer.findFirst({ where: { email: newEmail, NOT: { id } } })
    if (taken) return NextResponse.json({ error: EMAIL_TAKEN }, { status: 409 })
  }

  // An edit that carries an address goes through a transaction with the member's row locked, so
  // that two edits, or an edit and a merge or an erasure, never interleave and the address compared
  // is the one under the lock (an unlocked comparison would let a form that still shows the old
  // address put it back after a correction without renewing anything). A corrected address renews
  // the member's links in that same transaction (src/lib/member-address-revocation.ts): the old
  // address loses access, the new one receives what the member needs. Any other edit is a plain
  // update, as before.
  let volunteer
  let renewal: Awaited<ReturnType<typeof renewMemberLinks>> | null = null
  try {
    if (newEmail === undefined) {
      volunteer = await db.volunteer.update({ where: { id }, data: updateData })
    } else {
      const outcome = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ${id} FOR UPDATE`
        const locked = await tx.volunteer.findFirst({ where: { id }, select: { email: true, erasedAt: true, mergedIntoId: true } })
        if (!locked) return { notFound: true as const }
        const refusal = memberWriteRefusal(locked)
        if (refusal) return { refused: refusal }
        const updated = await tx.volunteer.update({ where: { id }, data: updateData })
        const renewed = addressCorrected(locked.email, updated.email)
          ? await renewMemberLinks(tx as unknown as Tx, {
            organizationId,
            volunteer: { id, firstName: updated.firstName, lastName: updated.lastName, active: updated.active },
            oldEmail: locked.email!,
            newEmail: updated.email,
            now: new Date(),
          })
          : null
        return { updated, renewed }
      }, SEND_TRANSACTION_OPTIONS)
      if ("notFound" in outcome) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
      if ("refused" in outcome) return NextResponse.json({ error: outcome.refused }, { status: 409 })
      volunteer = outcome.updated
      renewal = outcome.renewed
    }
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: EMAIL_TAKEN }, { status: 409 })
    throw e
  }
  if (renewal) deliverAfterResponse(renewal.outboxIds)

  // Deactivation is its own action (matches DELETE's "soft delete"), distinct from a plain field
  // edit — logged separately so the activity list reads naturally either way. `tags` excluded:
  // diffFields compares by reference, and two content-equal arrays from before/after are never
  // ===, so it would report a "change" on every update regardless of whether tags actually moved.
  const deactivated = before.active && !volunteer.active
  const changes = diffFields(before, volunteer, ["firstName", "lastName", "email", "phone", "notes", "active"])
  if (deactivated) {
    await logOrgEvent({
      organizationId,
      actor: adminActor(guard.session),
      action: "member.deactivated",
      entityType: "Member",
      entityId: id,
    })
  } else if (changes) {
    // No values in the log — a member record is itself PII (name, email, phone, notes), unlike
    // most entities EventLog documents. Field names only, same spirit as EventPage's content
    // redaction.
    await logOrgEvent({
      organizationId,
      actor: adminActor(guard.session),
      action: "member.updated",
      entityType: "Member",
      entityId: id,
      changes: Object.fromEntries(Object.keys(changes).map((field) => [field, { from: "(modifié)", to: "(modifié)" }])),
    })
  }

  if (renewal) {
    await logOrgEvent({
      organizationId,
      actor: adminActor(guard.session),
      action: "member.links_renewed",
      entityType: "Member",
      entityId: id,
    })
  }

  // `linksRenewed`: what the edit form tells the organiser after a corrected address.
  return NextResponse.json({ ...volunteer, ...(renewal ? { linksRenewed: { links: renewal.registrations + renewal.invites, emailsQueued: renewal.outboxIds.length } } : {}) })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id } = await params

  const owned = await db.volunteer.findFirst({ where: { id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Soft delete: keep history (registrations, future stats) but hide from roster.
  await db.volunteer.update({ where: { id }, data: { active: false } })

  await logOrgEvent({
    organizationId,
    actor: adminActor(guard.session),
    action: "member.deactivated",
    entityType: "Member",
    entityId: id,
  })

  return NextResponse.json({ success: true })
}

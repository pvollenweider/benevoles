// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The member record a public sign-up attaches its registrations to, resolved and locked inside the
 * sign-up transaction (#285, #309, #516).
 *
 * The sign-up looks the address up before its transaction starts; the record it found may have
 * had its personal data erased (#516) in between. So the match is re-read here under a row lock
 * (`FOR UPDATE`, the same lock the erasure takes first, so the two serialise: no deadlock, as the
 * erasure never locks a shift): if it is erased by then, it is treated as no match at all and a new
 * record is created, exactly as for a first sign-up. Nothing of this submission (comment, phone,
 * answers, profile) is ever written onto an erased record. If the erasure comes second, it scrubs
 * what this sign-up wrote, as for any other registration.
 *
 * Server-only (takes a transaction client).
 */

import type { Prisma } from "@/generated/prisma/client"

/** The slice of the interactive transaction client this needs. */
export type SignupVolunteerTx = Pick<Prisma.TransactionClient, "$queryRaw"> & {
  volunteer: Pick<Prisma.TransactionClient["volunteer"], "createMany" | "findFirstOrThrow">
}

export interface SignupVolunteerResult {
  volunteerId: string
  /** This sign-up inserted the record (no other sign-up of the same address got there first). */
  createdNow: boolean
  /** The record matched before the transaction was erased meanwhile: a new one is used instead. */
  matchErased: boolean
}

export async function lockSignupVolunteer(
  tx: SignupVolunteerTx,
  opts: { existingId: string | null; organizationId: string; email: string; create: Omit<Prisma.VolunteerCreateManyInput, "email" | "organizationId"> },
): Promise<SignupVolunteerResult> {
  let matchErased = false
  if (opts.existingId) {
    const rows = await tx.$queryRaw<{ id: string; erasedAt: Date | null }[]>`SELECT id, "erasedAt" FROM "Volunteer" WHERE id = ${opts.existingId} FOR UPDATE`
    if (rows.length > 0 && !rows[0].erasedAt) return { volunteerId: opts.existingId, createdNow: false, matchErased: false }
    matchErased = rows.length > 0
  }
  // ON CONFLICT DO NOTHING (skipDuplicates) so a concurrent first sign-up with the same address
  // doesn't abort this transaction; whoever inserted it "created" it. An erased record has no
  // address any more, so it never conflicts here.
  const { count } = await tx.volunteer.createMany({ data: [{ ...opts.create, email: opts.email, organizationId: opts.organizationId }], skipDuplicates: true })
  const { id } = await tx.volunteer.findFirstOrThrow({ where: { email: opts.email, organizationId: opts.organizationId }, select: { id: true } })
  // Same per-volunteer lock as an existing match (#285): overlap and role limits are re-checked under it.
  await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ${id} FOR UPDATE`
  return { volunteerId: id, createdNow: count === 1, matchErased }
}

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
 * An address corrected by an organiser in between (#1138 follow-up) is caught the same way: the
 * address is re-read under the lock, and a record that no longer holds the submitted address throws
 * `SignupMatchMovedError`. The caller rolls its transaction back (so it keeps no lock on the old
 * match, and never locks two members) and either refuses, when the sign-up relied on a proof of that
 * member's address, or starts again without the stale match, so the sign-up goes to whoever holds
 * the address now, exactly as one arriving after the correction would. The record found or created
 * for the address is locked the same way, only while it still holds the address and is not erased.
 *
 * Server-only (takes a transaction client).
 */

import type { Prisma } from "@/generated/prisma/client"

/** The slice of the interactive transaction client this needs. */
export type SignupVolunteerTx = Pick<Prisma.TransactionClient, "$queryRaw"> & {
  volunteer: Pick<Prisma.TransactionClient["volunteer"], "createMany" | "findFirstOrThrow">
}

/** The record matched before the transaction no longer holds the submitted address (see above). */
export class SignupMatchMovedError extends Error {
  constructor() {
    super("The member matched before the sign-up transaction no longer holds this address")
  }
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
    const rows = await tx.$queryRaw<{ id: string; erasedAt: Date | null; email: string | null }[]>`SELECT id, "erasedAt", email FROM "Volunteer" WHERE id = ${opts.existingId} FOR UPDATE`
    const row = rows[0]
    if (row && !row.erasedAt) {
      // Case-insensitive, as the lookup before the transaction (addresses stored before #310).
      if (row.email?.toLowerCase() === opts.email.toLowerCase()) return { volunteerId: opts.existingId, createdNow: false, matchErased: false }
      throw new SignupMatchMovedError()
    }
    matchErased = row != null
  }
  // ON CONFLICT DO NOTHING (skipDuplicates) so a concurrent first sign-up with the same address
  // doesn't abort this transaction; whoever inserted it "created" it. An erased record has no
  // address any more, so it never conflicts here.
  const { count } = await tx.volunteer.createMany({ data: [{ ...opts.create, email: opts.email, organizationId: opts.organizationId }], skipDuplicates: true })
  let id: string
  try {
    ({ id } = await tx.volunteer.findFirstOrThrow({ where: { email: opts.email, organizationId: opts.organizationId }, select: { id: true } }))
  } catch (e) {
    // The record that held the address lost it between the insert and this read.
    if ((e as { code?: unknown })?.code === "P2025") throw new SignupMatchMovedError()
    throw e
  }
  // Same per-volunteer lock as an existing match (#285): overlap and role limits are re-checked
  // under it. Locked only while it still holds the address and is not erased: under READ COMMITTED
  // the condition is evaluated again on the row's latest version once the lock is granted.
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Volunteer" WHERE id = ${id} AND email = ${opts.email} AND "erasedAt" IS NULL FOR UPDATE`
  if (locked.length === 0) throw new SignupMatchMovedError()
  return { volunteerId: id, createdNow: count === 1, matchErased }
}

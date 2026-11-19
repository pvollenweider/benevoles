// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The organisation-wide personal link (#1429, lot A): one token per Volunteer, opening
 * /mes-inscriptions/<token> for every upcoming registration of that person in the organisation.
 *
 * Storage follows Registration.editToken (#290, src/lib/token-vault.ts): `orgLinkTokenHash` for
 * lookups (SHA-256 of the random token), `orgLinkTokenEnc` to re-send it (AES-256-GCM,
 * TOKEN_ENCRYPTION_KEY), `orgLinkTokenLegacy` only while no key is configured. A database dump
 * alone yields no usable link.
 *
 * Issued lazily, never in bulk: the first lost-link request, the first renewal, the first action
 * that emails it. Two requests racing to issue the same volunteer's token use one conditional
 * update (`orgLinkTokenHash` must still be the value they read); the loser reads the winner's
 * token instead of overwriting it, so parallel requests never send two different links.
 *
 * Revocation is the security property: address correction, merge (the surviving record), erasure,
 * link regeneration, a restored registration and « Renouveler mon lien » all revoke the token in
 * their own transaction, so every old copy stops resolving at once. Those paths write the cleared
 * columns inside the transaction (by volunteer id, or — for the renewal route — conditioned on the
 * hash of the token actually presented), never from a value read before it. A revoked link is
 * re-issued lazily by the next need.
 */

import { randomBytes } from "node:crypto"
import { hashToken } from "./token-hash"
import { revealToken, sealToken } from "./token-vault"

/** 32 random bytes, base64url (43 characters): the same strength as the other link secrets. */
export function newOrgLinkToken(): string {
  return randomBytes(32).toString("base64url")
}

export const ORG_LINK_TOKEN_SELECT = {
  orgLinkTokenHash: true,
  orgLinkTokenEnc: true,
  orgLinkTokenLegacy: true,
  orgLinkIssuedAt: true,
} as const

export type OrgLinkRow = {
  orgLinkTokenHash: string | null
  orgLinkTokenEnc: string | null
  orgLinkTokenLegacy: string | null
  orgLinkIssuedAt: Date | null
}

/** A token that can be put in a link again, with when it was issued (null on older rows). */
export type OrgLinkIssued = { token: string; issuedAt: Date | null }

/** The columns to write for a new token: hash always, then encrypted or clear like editToken. */
export function orgLinkTokenData(token: string, issuedAt = new Date()) {
  const sealed = sealToken(token)
  return {
    orgLinkTokenHash: sealed.hash,
    orgLinkTokenEnc: sealed.enc,
    orgLinkTokenLegacy: sealed.legacy,
    orgLinkIssuedAt: issuedAt,
  }
}

/**
 * The columns to write to revoke the link: all four cleared in one update, never a half-state
 * (a hash without its encrypted copy, or an issued date for a link that no longer exists). The
 * next need issues a fresh token lazily, so revocation never mass-issues.
 */
export function clearOrgLinkData() {
  return {
    orgLinkTokenHash: null,
    orgLinkTokenEnc: null,
    orgLinkTokenLegacy: null,
    orgLinkIssuedAt: null,
  }
}

/** The lookup condition of a presented token. */
export function orgLinkTokenWhere(token: string) {
  return { orgLinkTokenHash: hashToken(token) }
}

function reveal(row: OrgLinkRow): string | null {
  if (!row.orgLinkTokenEnc && !row.orgLinkTokenLegacy) return null
  try {
    return revealToken({ enc: row.orgLinkTokenEnc, legacy: row.orgLinkTokenLegacy })
  } catch {
    // A key rotated away, or a value written by another instance with a key we don't hold: the
    // token still resolves (the hash is enough), only re-sending it is impossible. The caller
    // issues a new one rather than send a broken link.
    return null
  }
}

/** The volunteer and organisation a token resolves to, or null. */
export type OrgLinkTarget = {
  id: string
  organizationId: string
  firstName: string
  lastName: string
  email: string | null
  organization: { id: string; name: string; slug: string; timeZone: string | null; active: boolean; suspendedAt: Date | null }
}

const ORG_LINK_TARGET_SELECT = {
  id: true,
  organizationId: true,
  firstName: true,
  lastName: true,
  email: true,
  organization: { select: { id: true, name: true, slug: true, timeZone: true, active: true, suspendedAt: true } },
} as const

/**
 * The slice of the Prisma client (or of a transaction) this module needs, narrow and duck-typed
 * like LinkRegenerationDb: the real client satisfies it structurally.
 */
export interface OrgLinkDb {
  volunteer: {
    findFirst(args: { where: Record<string, unknown>; select: typeof ORG_LINK_TOKEN_SELECT }): Promise<OrgLinkRow | null>
    findFirst(args: { where: Record<string, unknown>; select: typeof ORG_LINK_TARGET_SELECT }): Promise<OrgLinkTarget | null>
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>
  }
}

/** Reads the token of a volunteer in this organisation, issuing one lazily if there is none. */
export async function ensureOrgLink(
  db: OrgLinkDb,
  volunteerId: string,
  organizationId: string,
  now = new Date(),
): Promise<OrgLinkIssued | null> {
  // Bounded: every retry after a lost race reads a token some other request just committed.
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.volunteer.findFirst({
      where: { id: volunteerId, organizationId },
      select: ORG_LINK_TOKEN_SELECT,
    })
    if (!row) return null
    if (row.orgLinkTokenHash) {
      const token = reveal(row)
      if (token) return { token, issuedAt: row.orgLinkIssuedAt }
    }

    const token = newOrgLinkToken()
    const { count } = await db.volunteer.updateMany({
      // Conditional on what was read: only one of two parallel requests can create the token.
      where: { id: volunteerId, organizationId, orgLinkTokenHash: row.orgLinkTokenHash },
      data: orgLinkTokenData(token, now),
    })
    if (count === 1) return { token, issuedAt: now }
  }
  return null
}

/**
 * Replaces the token with a fresh one, but only if it is still the one the caller read
 * (`expectedHash`): two simultaneous renewals issue one new link, not two. Returns null when
 * another request won (the caller must not send its own token).
 */
export async function rotateOrgLink(
  db: OrgLinkDb,
  input: { volunteerId: string; organizationId: string; expectedHash: string | null; now?: Date },
): Promise<OrgLinkIssued | null> {
  const token = newOrgLinkToken()
  const now = input.now ?? new Date()
  const { count } = await db.volunteer.updateMany({
    where: { id: input.volunteerId, organizationId: input.organizationId, orgLinkTokenHash: input.expectedHash },
    data: orgLinkTokenData(token, now),
  })
  return count === 1 ? { token, issuedAt: now } : null
}

/** Resolves a presented token to its volunteer and organisation, or null. */
export async function lookupOrgLink(db: OrgLinkDb, token: string): Promise<OrgLinkTarget | null> {
  const target = await db.volunteer.findFirst({
    where: orgLinkTokenWhere(token),
    select: ORG_LINK_TARGET_SELECT,
  })
  if (!target || !target.organizationId || !target.organization) return null
  return target as OrgLinkTarget
}

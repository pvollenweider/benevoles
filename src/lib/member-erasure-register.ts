// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The erasure register (#516): what lets an operator replay erasures after restoring a backup
 * taken before them (a restore brings the erased personal data back; nothing selective exists).
 * No personal data in it: the member id (whose record is itself anonymised) and a keyed hash of the
 * normalized email, bound to the organisation so the same address in two organisations gives two
 * unrelated hashes, and keyed with AUTH_SECRET so a database dump alone can't confirm a guessed
 * address. Because the key is AUTH_SECRET, rotating AUTH_SECRET makes hash matching of records
 * erased before the rotation impossible (the new key gives a different hash): export the register
 * before rotating, and replay by member id only afterwards (a restore of the same database keeps
 * the ids). Documented in docs/rgpd/procedure-effacement.md, docs/configuration.md and the
 * AUTH_SECRET line of docs/rgpd/procedure-violation.md.
 *
 * Each erasure also writes one register line to the application log (stdout, `member.erased`), in
 * the exact format the replay reads: if the database itself is lost with the entries written since
 * the last backup, they can be rebuilt from the container logs (kept 90 days, docs/retention.md).
 *
 * Operator procedure: docs/rgpd/procedure-effacement.md; tool: scripts/erasure-register.ts.
 */

import { createHmac } from "node:crypto"
import { normalizeEmail } from "./email-address"

export function erasureEmailHash(organizationId: string, email: string, secret: string): string {
  return createHmac("sha256", secret).update(`erasure:v1:${organizationId}:${normalizeEmail(email)}`).digest("hex")
}

export interface ErasureRegisterLine {
  organizationId: string
  volunteerId: string
  emailHash: string | null
  erasedAt: string
}

export const REGISTER_LOG_EVENT = "member.erased"

/** One line of the export, and of the application log. */
export function registerLine(entry: { organizationId: string; volunteerId: string; emailHash: string | null; erasedAt: Date }): string {
  return JSON.stringify({ event: REGISTER_LOG_EVENT, organizationId: entry.organizationId, volunteerId: entry.volunteerId, emailHash: entry.emailHash, erasedAt: entry.erasedAt.toISOString() })
}

/**
 * Reads register lines from an export or from raw application logs: any line holding a JSON
 * object with `"event":"member.erased"` (anything before the first `{`, such as a log prefix, is
 * ignored). Malformed lines are reported, never guessed. Duplicates (same member) collapse to the
 * earliest erasure.
 */
export function parseRegisterLines(text: string): { lines: ErasureRegisterLine[]; rejected: number } {
  const byVolunteer = new Map<string, ErasureRegisterLine>()
  let rejected = 0
  for (const raw of text.split(/\r?\n/)) {
    const start = raw.indexOf("{")
    if (start === -1 || !raw.includes(REGISTER_LOG_EVENT)) continue
    let obj: unknown
    try {
      obj = JSON.parse(raw.slice(start))
    } catch {
      rejected++
      continue
    }
    const o = obj as Record<string, unknown>
    const valid =
      o.event === REGISTER_LOG_EVENT &&
      typeof o.organizationId === "string" && o.organizationId &&
      typeof o.volunteerId === "string" && o.volunteerId &&
      (o.emailHash === null || (typeof o.emailHash === "string" && /^[0-9a-f]{64}$/.test(o.emailHash))) &&
      typeof o.erasedAt === "string" && !Number.isNaN(Date.parse(o.erasedAt))
    if (!valid) {
      rejected++
      continue
    }
    const line: ErasureRegisterLine = { organizationId: o.organizationId as string, volunteerId: o.volunteerId as string, emailHash: o.emailHash as string | null, erasedAt: o.erasedAt as string }
    const prev = byVolunteer.get(line.volunteerId)
    if (!prev || Date.parse(line.erasedAt) < Date.parse(prev.erasedAt)) byVolunteer.set(line.volunteerId, line)
  }
  return { lines: [...byVolunteer.values()].sort((a, b) => Date.parse(a.erasedAt) - Date.parse(b.erasedAt)), rejected }
}

export type ReplayDecision =
  | { kind: "already_erased"; volunteerId: string }
  | { kind: "erase"; volunteerId: string; matchedBy: "id" | "email_hash" }
  | { kind: "not_found" }

/**
 * What to do with one register line against the restored database (pure, given what was found).
 * By id first: a restore brings the record back under the same id. Only when that id is gone, a
 * record with the same address hash created before the erasure (never one created after it: that
 * is the person signing up again, of their own accord, after the erasure).
 */
export function replayDecision(
  line: ErasureRegisterLine,
  byId: { id: string; erasedAt: Date | null } | null,
  hashCandidates: { id: string; createdAt: Date; erasedAt: Date | null; emailHash: string | null }[],
): ReplayDecision[] {
  if (byId) return [byId.erasedAt ? { kind: "already_erased", volunteerId: byId.id } : { kind: "erase", volunteerId: byId.id, matchedBy: "id" }]
  if (!line.emailHash) return [{ kind: "not_found" }]
  const erasedAt = Date.parse(line.erasedAt)
  const matches = hashCandidates.filter((c) => !c.erasedAt && c.emailHash === line.emailHash && c.createdAt.getTime() <= erasedAt)
  if (matches.length === 0) return [{ kind: "not_found" }]
  return matches.map((m) => ({ kind: "erase" as const, volunteerId: m.id, matchedBy: "email_hash" as const }))
}

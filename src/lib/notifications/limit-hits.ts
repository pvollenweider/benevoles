// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { reportError } from "@/lib/report-error"

/**
 * Sending limits reached (#1100): what the operator sees in /super-admin, kept 90 days
 * (src/lib/retention.ts). One EmailLimitHit row per limit, organisation and UTC hour, the same
 * grain as the operator alert (`alertKey` in send-limits.ts), with two counts:
 *
 * - **held**: an outbox email over a limit, back to pending until the window ends (harmless if
 *   the queue drains). Counted once per email and hour: the outbox marks the row (`lastHeldAt`)
 *   with a conditional update, so an email held at every retry is not counted at every retry.
 * - **refused**: an email that did not leave because of a limit, a direct send that failed with
 *   `limit:*` (its caller reports the failure) or a public-triggered email dropped over the
 *   per-recipient or sign-up cap. These are attempts, not deduplicated emails.
 *
 * Nothing about the recipient or the content: an organisation id, a limit name, times, counts.
 * Recording is best effort: a failure is reported and never changes whether an email goes.
 */

export type LimitHitOutcome = "held" | "refused"

/** How long a send waits for its recording at most: past it the send goes on, the write may still land. */
export const RECORD_TIMEOUT_MS = 2000

/**
 * Runs a recording step so that nothing it does can reach the send: a failure, or a reporter that
 * throws while reporting it, is swallowed, and a step slower than RECORD_TIMEOUT_MS is no longer
 * waited for (a blocked write must not hold the rest of an outbox batch).
 */
export async function bestEffort(name: string, step: () => Promise<unknown>, timeoutMs: number = RECORD_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const report = (e: unknown) => {
    try { reportError(name)(e) } catch { /* reporting must not fail the send either */ }
  }
  try {
    await Promise.race([
      step().catch(report),
      new Promise<void>((resolve) => { timer = setTimeout(() => { report(new Error(`${name}: no answer after ${timeoutMs} ms`)); resolve() }, timeoutMs) }),
    ])
  } catch (e) {
    report(e)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** The UTC hour an instant belongs to: the start of the bucket. */
export function hourStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000)
}

/** The row's key: one per limit, organisation (or « platform ») and UTC hour. */
export function limitHitBucket(limit: string, organizationId: string | null | undefined, now: Date): string {
  return `${limit}:${organizationId ?? "platform"}:${now.toISOString().slice(0, 13)}`
}

type LimitHitDb = { emailLimitHit: { upsert: (typeof prisma)["emailLimitHit"]["upsert"] } }

/** Adds one held or refused email to its hour's row (an atomic INSERT … ON CONFLICT upsert). */
export async function recordLimitHit(
  hit: { organizationId: string | null | undefined; limit: string; outcome: LimitHitOutcome; now?: Date },
  db: LimitHitDb = prisma,
): Promise<void> {
  const now = hit.now ?? new Date()
  const held = hit.outcome === "held" ? 1 : 0
  const refused = hit.outcome === "refused" ? 1 : 0
  const bucket = limitHitBucket(hit.limit, hit.organizationId, now)
  await bestEffort("email.limit.record", () => db.emailLimitHit.upsert({
    where: { bucket },
    create: {
      bucket,
      organizationId: hit.organizationId ?? null,
      limit: hit.limit,
      hourStart: hourStart(now),
      heldCount: held,
      refusedCount: refused,
      firstAt: now,
      lastAt: now,
    },
    update: { heldCount: { increment: held }, refusedCount: { increment: refused }, lastAt: now },
  }))
}

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { scrubPersonFromRun, SCRUBBED_HASH } from "./proposal-config"
import type { Tx } from "./registration-capacity"

/**
 * Generated proposals (#1172) in the member operations, server only and light on imports: erasure
 * (#516) and merge (#600) call these inside their own transaction. The past-event anonymisation
 * deletes runs and targets itself (src/lib/past-event-anonymisation.ts).
 *
 * A run keeps a person in its configuration, its frozen input, its result and its write receipt.
 * Removing them leaves the run unable to be replayed: its fingerprint is set to « scrubbed » (it
 * reads as stale), and a run still queued or running is stopped and its attempt fenced off, so a
 * late completion can never write back what was just erased.
 */

type RunJson = { id: string; status: string; configuration: unknown; snapshot: unknown; result: unknown; written: unknown; progress: unknown }

/** Removes these people from every run of the organisation that names them. Returns how many runs changed. */
export async function scrubPeopleFromRuns(tx: Tx, organizationId: string, personIds: readonly string[]): Promise<number> {
  if (personIds.length === 0) return 0
  const ids = [...new Set(personIds)]
  // Runs whose scope names one of them (anyone in a snapshot, result or receipt is in the scope).
  const runs = await tx.$queryRaw<RunJson[]>`
    SELECT r.id, r.status, r.configuration, r.snapshot, r.result, r.written, r.progress
    FROM "ProposalRun" r JOIN "Event" e ON e.id = r."eventId"
    WHERE e."organizationId" = ${organizationId}
      AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.configuration->'scope'->'volunteerIds') v WHERE v = ANY(${ids}::text[]))
    ORDER BY r.id FOR UPDATE OF r`
  for (const run of runs) {
    let data = { configuration: run.configuration, snapshot: run.snapshot, result: run.result, written: run.written, progress: run.progress }
    for (const id of ids) data = scrubPersonFromRun(data, id)
    const active = run.status === "queued" || run.status === "running"
    await tx.proposalRun.update({
      where: { id: run.id },
      data: {
        configuration: data.configuration as object, ...(data.snapshot ? { snapshot: data.snapshot as object } : {}), ...(data.result ? { result: data.result as object } : {}),
        ...(data.written ? { written: data.written as object } : {}), inputHash: SCRUBBED_HASH,
        ...(active ? { status: "interrupted", stopReason: "cancelled", leaseToken: null, cancelRequestedAt: new Date(), finishedAt: new Date() } : {}),
      },
    })
  }
  return runs.length
}

/**
 * A member merge: the absorbed record's hour targets move to the kept record where it has none on
 * that event; where both have one, the kept record's stays (never summed). Then the absorbed record
 * is removed from every run (its runs read as stale).
 */
export async function mergeProposalData(tx: Tx, organizationId: string, keepId: string, absorbId: string): Promise<void> {
  const absorbed = await tx.eventVolunteerTarget.findMany({ where: { volunteerId: absorbId }, select: { id: true, eventId: true } })
  for (const t of absorbed) {
    const kept = await tx.eventVolunteerTarget.findFirst({ where: { volunteerId: keepId, eventId: t.eventId }, select: { id: true } })
    if (kept) await tx.eventVolunteerTarget.delete({ where: { id: t.id } })
    else await tx.eventVolunteerTarget.update({ where: { id: t.id }, data: { volunteerId: keepId, revision: { increment: 1 } } })
  }
  await scrubPeopleFromRuns(tx, organizationId, [absorbId])
}

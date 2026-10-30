// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash, randomUUID } from "node:crypto"
import { availabilityStamp, draftShiftTerms, MAX_EVENT_DRAFTS } from "./draft-assignments"
import { readAnswersForFit } from "./availability-assist-data"
import { canonicalConfig, changedParts, configProblem, SCRUBBED_HASH, type InputPart, type ProposalConfig } from "./proposal-config"
import { buildReport, type ProposalReport } from "./proposal-explanations"
import { PROPOSAL_DEADLINE_MS, type ProposalInput } from "./proposal-input"
import { preflight } from "./proposal-preflight"
import { validateAssignments } from "./proposal-proofs"
import { buildProposalSnapshot, type Replacement } from "./proposal-runs-data"
import { ProposalSearch, runProposalSearch, type ProposalAssignment, type SolveOutcome } from "./proposal-solver"
import { prisma } from "./prisma"
import { getOrgClient, type OrgScopedPrisma } from "./prisma-org"
import { lockShifts, type Tx } from "./registration-capacity"
import { lockVolunteerRows, lockWorkloadShared } from "./workload-guard"

/**
 * Generated assignment proposals (#1172), server only: launching a run, computing it after the
 * response, and writing its result into the drafts. Nothing here creates a registration or sends a
 * message: a proposal only ever becomes draft assignments (`source: "proposal"`), which the
 * organiser reviews and publishes with the existing all-or-nothing publication (#1146).
 *
 * Execution (Codex 2026-10-30): in the Node process that took the request, after the response
 * (`after()` in the route), in cooperative slices that yield to the event loop, at most
 * `MAX_RUNNING_PER_PROCESS` at once; others wait « queued » and are claimed when a slot frees. An
 * attempt holds a lease (`leaseToken`, `leaseExpiresAt` in database time), renewed every few seconds
 * only while still current; a lost or expired lease ends the attempt without writing anything. Any
 * read or launch on the event turns an expired run into « recherche interrompue » (lease_expired).
 * No checkpoint: a run lost with its process is retried by the organiser, with the same seed.
 *
 * Writing (one transaction, the global lock order): the event's shared workload lock, the event
 * FOR SHARE, the shifts ORDER BY id, the volunteers ORDER BY id, the replaced drafts ORDER BY id, then
 * the run row FOR UPDATE, last (a cancellation and a heartbeat lock only the run row, so no cycle).
 * Under these locks the input is read again from the rows (D04, D05): assignments that no longer fit
 * are dropped and reported, and what remains is checked again as a whole (dropping a mission can
 * open an idle gap). The run is fenced: its attempt must still hold an unexpired lease (or, for a
 * partial result, the run must be interrupted and not written yet). A finished run writes at once; an
 * interrupted one only when the organiser asks (« Utiliser ce résultat partiel »).
 */

type Db = OrgScopedPrisma

export const MAX_RUNNING_PER_PROCESS = 2
/** How long a lease lasts without a heartbeat, and how often a running attempt renews it. */
export const LEASE_SECONDS = 20
const HEARTBEAT_MS = 2_000
/** A run still queued after this long is given up (its process is gone). */
export const QUEUE_MAX_AGE_SECONDS = 120
/** At most this many runs waiting on the whole service: a queue, not a backlog. */
export const MAX_QUEUED = 20

const sha = (s: string) => createHash("sha256").update(s).digest("hex")

export type RunFailure = { ok: false; status: 400 | 403 | 404 | 409 | 429; error: string; code: string; counts?: unknown }

export type RunView = {
  id: string
  status: string
  stopReason: string | null
  outcome: string | null
  seed: number
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
  writtenAt: Date | null
  writtenCount: number
  droppedCount: number
  progress: unknown
  configuration: unknown
  report: ProposalReport | null
  written: unknown
  stale: InputPart[]
  cancelRequested: boolean
}

// ── Expiry ────────────────────────────────────────────────────────────────────────────────────

/** Runs whose attempt stopped renewing its lease, or that waited too long, become interrupted (database time). */
export async function expireRuns(db: Pick<Db, "$executeRaw">, eventId?: string): Promise<number> {
  const scope = eventId ?? null
  const a = await db.$executeRaw`
    UPDATE "ProposalRun" SET status = 'interrupted', "stopReason" = 'lease_expired', "leaseToken" = NULL, "finishedAt" = now(), "updatedAt" = now()
    WHERE status = 'running' AND "leaseExpiresAt" < now() AND (${scope}::text IS NULL OR "eventId" = ${scope})`
  const b = await db.$executeRaw`
    UPDATE "ProposalRun" SET status = 'interrupted', "stopReason" = 'lease_expired', "finishedAt" = now(), "updatedAt" = now()
    WHERE status = 'queued' AND "createdAt" < now() - make_interval(secs => ${QUEUE_MAX_AGE_SECONDS}) AND (${scope}::text IS NULL OR "eventId" = ${scope})`
  return a + b
}

// ── Launch ────────────────────────────────────────────────────────────────────────────────────

export type LaunchResult = { ok: true; runId: string; replay: boolean; notice: string | null } | RunFailure

const runRequestHash = (config: ProposalConfig) => sha(canonicalConfig(config))

/**
 * Records a run, queued, with its frozen input; the caller starts `drainProposalRuns` after the
 * response. The same idempotency key with the same choices returns that run, whatever changed since
 * (checked before any new preflight); with other choices it is refused.
 */
export async function launchProposal(db: Db, input: { eventId: string; actorId: string | null; idempotencyKey: string; config: ProposalConfig; now?: Date }): Promise<LaunchResult> {
  const now = input.now ?? new Date()
  const requestHash = runRequestHash(input.config)
  const existing = await db.proposalRun.findFirst({ where: { eventId: input.eventId, idempotencyKey: input.idempotencyKey }, select: { id: true, requestHash: true } })
  if (existing) {
    if (existing.requestHash !== requestHash) return { ok: false, status: 409, error: "Cette proposition a déjà été lancée avec d'autres choix : rechargez la page.", code: "key_reused" }
    return { ok: true, runId: existing.id, replay: true, notice: null }
  }
  const problem = configProblem(input.config)
  if (problem) return { ok: false, status: 400, error: problem, code: "invalid" }
  await expireRuns(db, input.eventId)

  const snap = await buildProposalSnapshot(db, input.eventId, input.config, "compute", now)
  if (!snap.ok) return { ok: false, status: snap.status, error: snap.error, code: snap.code }
  const check = preflight(snap.input)
  if (!check.ok) return { ok: false, status: 409, error: check.message, code: check.code, counts: check.counts }

  const queued = await prisma.proposalRun.count({ where: { status: "queued" } })
  if (queued >= MAX_QUEUED) return { ok: false, status: 429, error: "Trop de propositions sont en attente sur le service : réessayez dans une minute.", code: "busy" }

  try {
    const run = await db.proposalRun.create({
      data: {
        eventId: input.eventId, createdById: input.actorId, idempotencyKey: input.idempotencyKey, requestHash, status: "queued",
        seed: input.config.seed, configuration: input.config as object, replacement: snap.replacement, snapshot: snap.input as object,
        inputVersion: snap.input.version, inputHash: snap.inputHash, hashes: snap.hashes,
      },
      select: { id: true },
    })
    return { ok: true, runId: run.id, replay: false, notice: check.notice }
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e
    // Two launches at once: the same key (a double click) returns the first; another run already active is refused.
    const again = await db.proposalRun.findFirst({ where: { eventId: input.eventId, idempotencyKey: input.idempotencyKey }, select: { id: true, requestHash: true } })
    if (again) return again.requestHash === requestHash ? { ok: true, runId: again.id, replay: true, notice: null } : { ok: false, status: 409, error: "Cette proposition a déjà été lancée avec d'autres choix : rechargez la page.", code: "key_reused" }
    return { ok: false, status: 409, error: "Une proposition est déjà en cours pour cet événement : attendez qu'elle finisse ou arrêtez-la.", code: "active" }
  }
}

// ── Execution ─────────────────────────────────────────────────────────────────────────────────

let running = 0

/** Runs in progress in this process (tests). */
export function runningInProcess(): number {
  return running
}

export type Claimed = { id: string; eventId: string; leaseToken: string }

/** Claims the oldest queued run of any organisation, if any: running, a new attempt and lease. Exported for tests. */
export async function claimNext(): Promise<Claimed | null> {
  await expireRuns(prisma)
  const token = randomUUID()
  const rows = await prisma.$queryRaw<{ id: string; eventId: string }[]>`
    UPDATE "ProposalRun" SET status = 'running', attempt = attempt + 1, "leaseToken" = ${token},
      "leaseExpiresAt" = now() + make_interval(secs => ${LEASE_SECONDS}), "startedAt" = now(), "updatedAt" = now()
    WHERE id = (SELECT id FROM "ProposalRun" WHERE status = 'queued' ORDER BY "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, "eventId"`
  return rows[0] ? { ...rows[0], leaseToken: token } : null
}

/**
 * Starts queued runs while this process has free slots, each to its end; called after a launch
 * response, and again whenever a run ends. Never throws (errors end the run as failed).
 */
export async function drainProposalRuns(opts: { deadlineMs?: number; wait?: boolean } = {}): Promise<void> {
  while (running < MAX_RUNNING_PER_PROCESS) {
    let claimed: Claimed | null
    try {
      claimed = await claimNext()
    } catch (e) {
      console.error("proposal claim failed", e)
      return
    }
    if (!claimed) return
    running++
    const job = executeRun(claimed, opts).catch((e) => console.error("proposal run failed", e)).finally(() => {
      running--
      void drainProposalRuns(opts)
    })
    if (opts.wait) await job // tests: one run at a time, awaited
  }
}

/** Renews the lease while the attempt is current; null when it is lost (stop, write nothing). */
async function heartbeat(c: Claimed, progress: object): Promise<{ cancelRequested: boolean } | null> {
  const rows = await prisma.$queryRaw<{ cancelRequestedAt: Date | null }[]>`
    UPDATE "ProposalRun" SET "leaseExpiresAt" = now() + make_interval(secs => ${LEASE_SECONDS}), progress = ${JSON.stringify(progress)}::jsonb, "updatedAt" = now()
    WHERE id = ${c.id} AND "leaseToken" = ${c.leaseToken} AND status = 'running' AND "leaseExpiresAt" > now()
    RETURNING "cancelRequestedAt"`
  return rows[0] ? { cancelRequested: rows[0].cancelRequestedAt != null } : null
}

/** Computes a claimed run and ends it (fenced). Exported for tests, which interleave other writes with it. */
export async function executeRun(c: Claimed, opts: { deadlineMs?: number; wait?: boolean } = {}): Promise<void> {
  const run = await prisma.proposalRun.findUnique({ where: { id: c.id }, select: { snapshot: true, event: { select: { organizationId: true } } } })
  if (!run?.snapshot || !run.event.organizationId) {
    await prisma.$executeRaw`UPDATE "ProposalRun" SET status = 'failed', "stopReason" = 'error', "leaseToken" = NULL, "finishedAt" = now(), "updatedAt" = now() WHERE id = ${c.id} AND "leaseToken" = ${c.leaseToken}`
    return
  }
  const input = run.snapshot as unknown as ProposalInput
  const search = new ProposalSearch(input)
  let lost = false
  let cancel = false
  let last = performance.now()
  let outcome: SolveOutcome
  try {
    outcome = await runProposalSearch(input, {
      search,
      deadlineMs: opts.deadlineMs ?? PROPOSAL_DEADLINE_MS,
      shouldStop: () => lost || cancel,
      onProgress: async (p) => {
        if (performance.now() - last < HEARTBEAT_MS) return
        last = performance.now()
        const beat = await heartbeat(c, { evaluations: p.evaluations, iterations: p.iterations, stage: search.stage })
        if (!beat) lost = true
        else if (beat.cancelRequested) cancel = true
      },
    })
  } catch (e) {
    console.error("proposal search failed", e)
    await prisma.$executeRaw`UPDATE "ProposalRun" SET status = 'failed', "stopReason" = 'error', "leaseToken" = NULL, "finishedAt" = now(), "updatedAt" = now() WHERE id = ${c.id} AND "leaseToken" = ${c.leaseToken}`
    return
  }
  if (lost) return
  const report = buildReport(search.model, outcome)
  await completeRun(getOrgClient(run.event.organizationId), c, outcome, report)
}

/** The stored result of a search: the assignments found and the report on them (the solver's evidence). */
function resultOf(outcome: SolveOutcome, report: ProposalReport) {
  return {
    solverVersion: outcome.solverVersion, prngVersion: outcome.prngVersion, evaluations: outcome.evaluations, setupEvaluations: outcome.setupEvaluations,
    iterations: outcome.iterations, restarts: outcome.restarts, score: outcome.score, assignments: outcome.assignments, report,
  }
}

type RunRow = {
  id: string; eventId: string; status: string; leaseToken: string | null; cancelRequestedAt: Date | null; writtenAt: Date | null
  createdById: string | null; configuration: unknown; replacement: unknown; result: unknown; written: unknown; leaseValid: boolean
}

async function lockRun(tx: Tx, runId: string): Promise<RunRow | null> {
  const rows = await tx.$queryRaw<RunRow[]>`
    SELECT id, "eventId", status, "leaseToken", "cancelRequestedAt", "writtenAt", "createdById", configuration, replacement, result, written,
      ("leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" > now()) AS "leaseValid"
    FROM "ProposalRun" WHERE id = ${runId} FOR UPDATE`
  return rows[0] ?? null
}

/** The end of an attempt: interrupted (stored, nothing written) or finished (written into drafts). Fenced. */
async function completeRun(db: Db, c: Claimed, outcome: SolveOutcome, report: ProposalReport): Promise<void> {
  const result = resultOf(outcome, report)
  await db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const peek = await tx.proposalRun.findFirst({ where: { id: c.id }, select: { configuration: true, replacement: true } })
    if (!peek) return
    const write = outcome.execution === "finished"
    const locked = write ? await lockForWrite(tx, c.eventId, outcome.assignments, peek.replacement as Replacement) : true
    const run = await lockRun(tx, c.id)
    if (!run || run.status !== "running" || run.leaseToken !== c.leaseToken || !run.leaseValid || !locked) return
    const base = { result: result as object, solverVersion: outcome.solverVersion, outcome: report.outcome, leaseToken: null, finishedAt: new Date() }
    if (!write || run.cancelRequestedAt) {
      await tx.proposalRun.updateMany({ where: { id: c.id }, data: { ...base, status: "interrupted", stopReason: run.cancelRequestedAt ? "cancelled" : outcome.stopReason } })
      return
    }
    const receipt = await materialise(tx, run, outcome.assignments, run.createdById)
    await tx.proposalRun.updateMany({ where: { id: c.id }, data: { ...base, status: "finished", stopReason: outcome.stopReason, ...receipt } })
  }, { maxWait: 10_000, timeout: 60_000 })
}

/**
 * The locks before a write, in the global order: workload shared, event FOR SHARE, shifts, people,
 * replaced drafts. False when the event is gone.
 */
async function lockForWrite(tx: Tx, eventId: string, assignments: readonly ProposalAssignment[], replacement: Replacement): Promise<boolean> {
  await lockWorkloadShared(tx, eventId)
  const event = await tx.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return false
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR SHARE`
  const replaced = replacement.length > 0
    ? await tx.draftAssignment.findMany({ where: { eventId, id: { in: replacement.map((r) => r.id) } }, select: { id: true, shiftId: true, volunteerId: true } })
    : []
  await lockShifts(tx, [...new Set([...assignments.map((a) => a.shiftId), ...replaced.map((d) => d.shiftId)])].sort())
  await lockVolunteerRows(tx, [...new Set([...assignments.map((a) => a.volunteerId), ...replaced.map((d) => d.volunteerId)])].sort())
  if (replaced.length > 0) await tx.$queryRaw`SELECT id FROM "DraftAssignment" WHERE id = ANY(${replaced.map((d) => d.id)}::text[]) ORDER BY id FOR UPDATE`
  return true
}

export type Dropped = { shiftId: string; volunteerId: string; reason: string }

type Receipt = { writtenAt: Date | null; writtenById: string | null; writtenCount: number; droppedCount: number; written: object; baselineHashes?: object }

/**
 * Turns assignments into drafts, under the caller's locks: the input read again from the rows, what
 * no longer fits dropped (with why), the rest checked again as a whole, the replaced drafts
 * discarded, the new ones created. A global refusal (protection turned off, a shift gone) writes
 * nothing and says why.
 */
async function materialise(tx: Tx, run: RunRow, assignments: readonly ProposalAssignment[], actorId: string | null): Promise<Receipt> {
  const now = new Date()
  const config = run.configuration as ProposalConfig
  const frozen = run.replacement as Replacement
  const snap = await buildProposalSnapshot(tx, run.eventId, config, frozen, now)
  const refuse = (error: string): Receipt => ({ writtenAt: null, writtenById: null, writtenCount: 0, droppedCount: 0, written: { error } })
  if (!snap.ok) return refuse(snap.error)
  if (!snap.input.policy) return refuse("La protection des pauses et de la charge n'est plus complète et active : rien n'a été écrit dans les brouillons.")
  const current = snap.input

  // Pairs that cannot be written at all: the shift is no longer open, the person no longer selected,
  // or they already hold the shift (a registration or a draft written meanwhile).
  const dropped: Dropped[] = []
  const shifts = new Map(current.shifts.map((s) => [s.id, s]))
  const people = new Map(current.people.map((p) => [p.id, p]))
  let kept = assignments.filter((a) => {
    const p = people.get(a.volunteerId)
    if (!shifts.get(a.shiftId)?.inScope || !p) { dropped.push({ ...a, reason: "gone" }); return false }
    if (p.liveShiftIds.includes(a.shiftId)) { dropped.push({ ...a, reason: "already_on_shift" }); return false }
    return true
  })
  // Then the whole result against the current rows, again after every removal (an idle gap can open).
  for (let round = 0; round < 50; round++) {
    const violations = validateAssignments(current, kept)
    if (violations.length === 0) break
    const offenders = new Set(violations.filter((v) => v.volunteerId).map((v) => v.volunteerId!))
    const capacity = new Set(violations.filter((v) => !v.volunteerId && v.shiftId && v.code === "capacity").map((v) => v.shiftId!))
    const reasonOf = new Map(violations.filter((v) => v.volunteerId).map((v) => [v.volunteerId!, v.code]))
    const next: ProposalAssignment[] = []
    const extra = new Map<string, number>()
    for (const s of capacity) {
      const shift = shifts.get(s)!
      extra.set(s, kept.filter((a) => a.shiftId === s).length + shift.held - shift.capacity)
    }
    for (const a of [...kept].sort((x, y) => (x.volunteerId < y.volunteerId ? 1 : -1))) {
      if (offenders.has(a.volunteerId)) { dropped.push({ ...a, reason: reasonOf.get(a.volunteerId)! }); continue }
      if ((extra.get(a.shiftId) ?? 0) > 0) { extra.set(a.shiftId, extra.get(a.shiftId)! - 1); dropped.push({ ...a, reason: "capacity" }); continue }
      next.push(a)
    }
    if (next.length === kept.length) { for (const a of kept) dropped.push({ ...a, reason: "invalid" }); kept = []; break }
    kept = next
  }
  kept.sort((a, b) => (a.shiftId < b.shiftId ? -1 : a.shiftId > b.shiftId ? 1 : a.volunteerId < b.volunteerId ? -1 : 1))

  const pending = await tx.draftAssignment.count({ where: { eventId: run.eventId, status: "draft" } })
  const replaceable = await tx.draftAssignment.findMany({ where: { eventId: run.eventId, id: { in: frozen.map((r) => r.id) }, status: "draft", locked: false, source: "proposal" }, select: { id: true, revision: true } })
  const revisionOf = new Map(frozen.map((r) => [r.id, r.revision]))
  const discard = replaceable.filter((d) => revisionOf.get(d.id) === d.revision).map((d) => d.id)
  if (pending - discard.length + kept.length > MAX_EVENT_DRAFTS) return refuse(`Au plus ${MAX_EVENT_DRAFTS} affectations en brouillon par événement : publiez ou retirez-en d'abord.`)
  if (discard.length > 0) await tx.draftAssignment.updateMany({ where: { id: { in: discard }, eventId: run.eventId }, data: { status: "discarded", discardedAt: now, revision: { increment: 1 } } })

  const shiftRows = kept.length > 0 ? await tx.shift.findMany({
    where: { eventId: run.eventId, id: { in: [...new Set(kept.map((a) => a.shiftId))] } },
    select: { id: true, eventId: true, roleName: true, label: true, date: true, startTime: true, endTime: true, status: true, overlapAllowed: true, assignedOnly: true, requiresApproval: true, minAge: true, reservedTags: true, locationDetails: true, latitude: true, longitude: true },
  }) : []
  const shiftOf = new Map(shiftRows.map((s) => [s.id, s]))
  const answers = await readAnswersForFit(tx as never, run.eventId, [...new Set(kept.map((a) => a.volunteerId))])
  const created: { draftId: string; shiftId: string; volunteerId: string }[] = []
  for (const a of kept) {
    const row = await tx.draftAssignment.create({
      data: {
        eventId: run.eventId, shiftId: a.shiftId, volunteerId: a.volunteerId, source: "proposal", proposalRunId: run.id, createdById: run.createdById,
        shiftTerms: draftShiftTerms(shiftOf.get(a.shiftId)! as never), availabilityStamp: availabilityStamp(answers.get(a.volunteerId) ?? null),
        reviewedAt: now, reviewedById: run.createdById,
      },
      select: { id: true },
    })
    created.push({ draftId: row.id, ...a })
  }
  const runHashes = (await tx.proposalRun.findFirst({ where: { id: run.id }, select: { hashes: true, inputHash: true } }))
  const staleAtWrite = runHashes && runHashes.inputHash !== SCRUBBED_HASH ? changedParts(runHashes.hashes as Record<InputPart, string>, snap.hashes) : []
  await tx.eventLog.create({
    data: {
      eventId: run.eventId, actorType: actorId ? "admin" : "system", actorId,
      action: "proposal.written", entityType: "ProposalRun", entityId: run.id,
      changes: { drafts: { from: null, to: created.length }, dropped: { from: null, to: dropped.length }, replaced: { from: null, to: discard.length } },
    },
  })
  return {
    writtenAt: now, writtenById: actorId, writtenCount: created.length, droppedCount: dropped.length,
    written: { created, dropped, replaced: discard, staleAtWrite },
    // The freshness baseline: the input as written, its own new drafts being the ones a later run replaces.
    baselineHashes: snap.hashes,
  }
}

// ── The organiser's actions ───────────────────────────────────────────────────────────────────

export type WriteResult = { ok: true; replay: boolean; writtenCount: number; droppedCount: number } | RunFailure

/**
 * « Utiliser ce résultat partiel »: writes the stored result of an interrupted run into the drafts,
 * once, on the organiser's request (also a finished run whose write was refused, once fixed). The
 * same request again returns the receipt.
 */
export async function writeRunResult(db: Db, input: { eventId: string; runId: string; actorId: string | null }): Promise<WriteResult> {
  await expireRuns(db, input.eventId)
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const peek = await tx.proposalRun.findFirst({ where: { id: input.runId, eventId: input.eventId }, select: { result: true, replacement: true, writtenAt: true, writtenCount: true, droppedCount: true } })
    if (!peek) return { ok: false as const, status: 404 as const, error: "Proposition introuvable.", code: "not_found" }
    if (peek.writtenAt) return { ok: true as const, replay: true, writtenCount: peek.writtenCount, droppedCount: peek.droppedCount }
    const assignments = ((peek.result as { assignments?: ProposalAssignment[] } | null)?.assignments ?? [])
    await lockForWrite(tx, input.eventId, assignments, peek.replacement as Replacement)
    const run = await lockRun(tx, input.runId)
    if (!run || run.eventId !== input.eventId) return { ok: false as const, status: 404 as const, error: "Proposition introuvable.", code: "not_found" }
    if (run.writtenAt) {
      const again = await tx.proposalRun.findFirst({ where: { id: run.id }, select: { writtenCount: true, droppedCount: true } })
      return { ok: true as const, replay: true, writtenCount: again?.writtenCount ?? 0, droppedCount: again?.droppedCount ?? 0 }
    }
    if ((run.status !== "interrupted" && run.status !== "finished") || !run.result) return { ok: false as const, status: 409 as const, error: "Cette proposition n'a pas de résultat à écrire.", code: "no_result" }
    const receipt = await materialise(tx, run, assignments, input.actorId)
    await tx.proposalRun.updateMany({ where: { id: run.id }, data: receipt })
    if (!receipt.writtenAt) return { ok: false as const, status: 409 as const, error: (receipt.written as { error: string }).error, code: "refused" }
    return { ok: true as const, replay: false, writtenCount: receipt.writtenCount, droppedCount: receipt.droppedCount }
  }, { maxWait: 10_000, timeout: 60_000 })
}

export type CancelResult = { ok: true; status: string } | RunFailure

/** « Arrêter »: a queued run stops at once, a running one at its next heartbeat; a written one cannot be cancelled. */
export async function cancelRun(db: Db, input: { eventId: string; runId: string }): Promise<CancelResult> {
  await expireRuns(db, input.eventId)
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const scoped = await tx.proposalRun.findFirst({ where: { id: input.runId, eventId: input.eventId }, select: { id: true } })
    if (!scoped) return { ok: false as const, status: 404 as const, error: "Proposition introuvable.", code: "not_found" }
    const run = await lockRun(tx, input.runId)
    if (!run) return { ok: false as const, status: 404 as const, error: "Proposition introuvable.", code: "not_found" }
    if (run.writtenAt) return { ok: false as const, status: 409 as const, error: "Cette proposition est déjà écrite dans les brouillons.", code: "written" }
    if (run.status === "queued") {
      await tx.proposalRun.updateMany({ where: { id: run.id }, data: { status: "interrupted", stopReason: "cancelled", cancelRequestedAt: new Date(), finishedAt: new Date() } })
      return { ok: true as const, status: "interrupted" }
    }
    if (run.status === "running") {
      if (!run.cancelRequestedAt) await tx.proposalRun.updateMany({ where: { id: run.id }, data: { cancelRequestedAt: new Date() } })
      return { ok: true as const, status: "running" }
    }
    // Already stopped (interrupted, failed, or finished without a write): nothing more to stop.
    return { ok: true as const, status: run.status }
  })
}

// ── Reads ─────────────────────────────────────────────────────────────────────────────────────

const VIEW_SELECT = {
  id: true, status: true, stopReason: true, outcome: true, seed: true, createdAt: true, startedAt: true, finishedAt: true, writtenAt: true, writtenCount: true,
  droppedCount: true, progress: true, configuration: true, result: true, written: true, cancelRequestedAt: true, replacement: true, hashes: true, inputHash: true, baselineHashes: true,
} as const

/** One run as the organiser sees it, its staleness recomputed from the rows now (no search). */
export async function readRun(db: Db, eventId: string, runId: string): Promise<RunView | null> {
  await expireRuns(db, eventId)
  const run = await db.proposalRun.findFirst({ where: { id: runId, eventId }, select: VIEW_SELECT })
  if (!run) return null
  let stale: InputPart[] = []
  if (run.status !== "queued" && run.status !== "running") {
    const written = run.written as { created?: { draftId: string }[] } | null
    // A written run is compared with the input as written, its own drafts being the ones a new run would replace.
    const replacement: Replacement = run.writtenAt ? (written?.created ?? []).map((c) => ({ id: c.draftId, revision: 1 })) : (run.replacement as Replacement)
    const baseline = (run.writtenAt ? run.baselineHashes : run.hashes) as Record<InputPart, string> | null
    const snap = await buildProposalSnapshot(db, eventId, run.configuration as ProposalConfig, replacement, new Date(), { ownDrafts: !!run.writtenAt })
    if (run.inputHash === SCRUBBED_HASH || !baseline) stale = ["people"]
    else stale = snap.ok ? changedParts(baseline, snap.hashes) : ["shifts"]
  }
  return {
    id: run.id, status: run.status, stopReason: run.stopReason, outcome: run.outcome, seed: run.seed, createdAt: run.createdAt, startedAt: run.startedAt,
    finishedAt: run.finishedAt, writtenAt: run.writtenAt, writtenCount: run.writtenCount, droppedCount: run.droppedCount, progress: run.progress,
    configuration: run.configuration, report: ((run.result as { report?: ProposalReport } | null)?.report) ?? null, written: run.written, stale,
    cancelRequested: !!run.cancelRequestedAt,
  }
}

/** The event's latest runs, newest first, without their payloads. */
export async function listRuns(db: Db, eventId: string, take = 10) {
  await expireRuns(db, eventId)
  return db.proposalRun.findMany({
    where: { eventId },
    select: { id: true, status: true, stopReason: true, outcome: true, seed: true, createdAt: true, finishedAt: true, writtenAt: true, writtenCount: true, droppedCount: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  })
}

/** The coverage of each run's report (« 29 places couvertes sur 31 » in the history), read without the whole result. */
export async function runCoverages(db: Pick<Db, "$queryRaw">, eventId: string, ids: string[]): Promise<Map<string, { filled: number; seats: number }>> {
  if (ids.length === 0) return new Map()
  const rows = await db.$queryRaw<{ id: string; filled: number | null; seats: number | null }[]>`
    SELECT id, (result->'report'->'coverage'->>'filled')::int AS filled, (result->'report'->'coverage'->>'seats')::int AS seats
    FROM "ProposalRun" WHERE "eventId" = ${eventId} AND id = ANY(${ids})`
  return new Map(rows.filter((r) => r.filled != null && r.seats != null).map((r) => [r.id, { filled: r.filled!, seats: r.seats! }]))
}

/** The configuration of the event's latest run, to prefill the next one (categories, night add-ons, reserve). */
export async function latestConfiguration(db: Db, eventId: string): Promise<unknown> {
  const run = await db.proposalRun.findFirst({ where: { eventId }, select: { configuration: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
  return run?.configuration ?? null
}

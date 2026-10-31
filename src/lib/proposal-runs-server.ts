// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash, randomUUID } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { availabilityStamp, draftAvailabilityStamp, draftShiftTerms, MAX_EVENT_DRAFTS } from "./draft-assignments"
import { readAnswersForFit, readAvailabilityGate } from "./availability-assist-data"
import {
  anotherSeed, canonicalConfig, changedParts, choicesKey, configProblem, DEFAULT_PROPOSAL_SEED, proposalConfigSchema, SCRUBBED_HASH, stableStringify,
  type InputPart, type ProposalConfig, type ResolvedProposalConfig,
} from "./proposal-config"
import { assignmentSet, findAlternative } from "./proposal-alternative"
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
 * attempt holds a lease (`leaseToken`, `leaseExpiresAt` in database time, read in UTC sessions:
 * src/lib/prisma-adapter.ts), renewed every few seconds only while still current, through the
 * report and the write too; a lost or expired lease ends the attempt without writing anything. Any
 * read or launch on the event turns an expired run into « Calcul arrêté avant la fin » (lease_expired),
 * and a run still waiting after `QUEUE_MAX_AGE_SECONDS` into « Calcul non démarré » (queue_expired).
 * No checkpoint: a run lost with its process is retried by the organiser.
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
  /** Its rank among the event's runs, oldest first (« Proposition 3 »): how the organiser tells runs apart. */
  ordinal: number
  /**
   * The ordinal of an earlier run with the same choices, the same data and another seed whose search
   * found exactly the same assignments (« Aucune autre répartition trouvée »); null otherwise.
   */
  sameAs: number | null
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
    UPDATE "ProposalRun" SET status = 'interrupted', "stopReason" = 'queue_expired', "finishedAt" = now(), "updatedAt" = now()
    WHERE status = 'queued' AND "createdAt" < now() - make_interval(secs => ${QUEUE_MAX_AGE_SECONDS}) AND (${scope}::text IS NULL OR "eventId" = ${scope})`
  return a + b
}

// ── Launch ────────────────────────────────────────────────────────────────────────────────────

export type LaunchResult = { ok: true; runId: string; replay: boolean; notice: string | null } | RunFailure

/**
 * What one launch asks for: the page's configuration (its seed omitted: the first proposal's), or
 * « Proposer une autre répartition » on an earlier run (`anotherOf`), whose stored choices are taken
 * again with the next seed. The request hash names the request, not the seed it resolves to, so a
 * retry with the same key returns the same run before anything is read again (Codex 2026-10-31).
 */
export type LaunchRequest = { config: ProposalConfig; anotherOf?: undefined } | { anotherOf: string; config?: undefined }

const requestHashOf = (r: LaunchRequest) => sha(r.anotherOf !== undefined ? stableStringify({ anotherOf: r.anotherOf }) : canonicalConfig(r.config))

const ANOTHER_UNAVAILABLE = "Les choix de cette proposition ne peuvent plus être repris : préparez une nouvelle proposition."

/** The configuration a launch computes, its seed resolved, or why it cannot. */
async function resolveConfig(db: Db, eventId: string, r: LaunchRequest): Promise<{ ok: true; config: ResolvedProposalConfig } | RunFailure> {
  if (r.anotherOf === undefined) return { ok: true, config: { ...r.config, seed: r.config.seed ?? DEFAULT_PROPOSAL_SEED } }
  const source = await db.proposalRun.findFirst({ where: { id: r.anotherOf, eventId }, select: { status: true, configuration: true, inputHash: true } })
  if (!source) return { ok: false, status: 404, error: "Proposition introuvable.", code: "not_found" }
  if (source.status !== "finished") return { ok: false, status: 409, error: "Cette proposition n'est pas terminée : attendez sa fin ou préparez une nouvelle proposition.", code: "source_unfinished" }
  const parsed = proposalConfigSchema.safeParse(source.configuration)
  if (source.inputHash === SCRUBBED_HASH || !parsed.success) return { ok: false, status: 409, error: ANOTHER_UNAVAILABLE, code: "source_unavailable" }
  // Every seed already tried with these choices, whatever became of its run (failed, stopped, written).
  const used = (await sameChoiceRuns(db, eventId, choicesKey(parsed.data))).flatMap((x) => x.seeds)
  return { ok: true, config: { ...parsed.data, seed: anotherSeed(used) } }
}

/** The seeds an alternative's search tried, as stored in its progress (validated: stored JSON). */
export function seedsTriedOf(progress: unknown): number[] {
  const list = (progress as { seedsTried?: unknown } | null)?.seedsTried
  return Array.isArray(list) ? list.filter((s): s is number => Number.isInteger(s) && s >= 0) : []
}

/**
 * The event's runs with these choices (never a scrubbed one), oldest first: each one's seeds (its own
 * and those its search tried) and, when it finished with a result, its assignments.
 */
async function sameChoiceRuns(db: Pick<Db, "proposalRun">, eventId: string, key: string) {
  const runs = await db.proposalRun.findMany({
    where: { eventId, inputHash: { not: SCRUBBED_HASH } },
    select: { id: true, seed: true, status: true, configuration: true, progress: true, result: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
  return runs.filter((x) => { const c = proposalConfigSchema.safeParse(x.configuration); return c.success && choicesKey(c.data) === key }).map((x) => ({
    id: x.id, createdAt: x.createdAt, seeds: [x.seed, ...seedsTriedOf(x.progress)],
    assignments: x.status === "finished" ? ((x.result as { assignments?: ProposalAssignment[] } | null)?.assignments ?? null) : null,
  }))
}

/**
 * Records a run, queued, with its frozen input; the caller starts `drainProposalRuns` after the
 * response. The same idempotency key with the same request returns that run, whatever changed since
 * (checked before any new read); with another request it is refused.
 */
export async function launchProposal(db: Db, input: { eventId: string; actorId: string | null; idempotencyKey: string; now?: Date } & LaunchRequest): Promise<LaunchResult> {
  const now = input.now ?? new Date()
  const request: LaunchRequest = input.anotherOf !== undefined ? { anotherOf: input.anotherOf } : { config: input.config! }
  const requestHash = requestHashOf(request)
  const existing = await db.proposalRun.findFirst({ where: { eventId: input.eventId, idempotencyKey: input.idempotencyKey }, select: { id: true, requestHash: true } })
  if (existing) {
    if (existing.requestHash !== requestHash) return { ok: false, status: 409, error: "Cette proposition a déjà été lancée avec d'autres choix : rechargez la page.", code: "key_reused" }
    return { ok: true, runId: existing.id, replay: true, notice: null }
  }
  const resolved = await resolveConfig(db, input.eventId, request)
  if (!resolved.ok) return resolved
  const config = resolved.config
  const problem = configProblem(config)
  if (problem) return { ok: false, status: 400, error: problem, code: "invalid" }
  await expireRuns(db, input.eventId)

  const snap = await buildProposalSnapshot(db, input.eventId, config, "compute", now)
  if (!snap.ok) return { ok: false, status: snap.status, error: snap.error, code: snap.code }
  const check = preflight(snap.input)
  if (!check.ok) return { ok: false, status: 409, error: check.message, code: check.code, counts: check.counts }

  const queued = await prisma.proposalRun.count({ where: { status: "queued" } })
  if (queued >= MAX_QUEUED) return { ok: false, status: 429, error: "Trop de propositions sont en attente sur le service : réessayez dans une minute.", code: "busy" }

  try {
    const run = await db.proposalRun.create({
      data: {
        eventId: input.eventId, createdById: input.actorId, idempotencyKey: input.idempotencyKey, requestHash, status: "queued",
        seed: config.seed, configuration: config as object, replacement: snap.replacement, snapshot: snap.input as object, alternative: request.anotherOf !== undefined,
        inputVersion: snap.input.version, inputHash: snap.inputHash, hashes: snap.hashes,
      },
      select: { id: true },
    })
    return { ok: true, runId: run.id, replay: false, notice: check.notice }
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e
    // Two launches at once: the same key (a double click) returns the first; another run already active is refused.
    const again = await db.proposalRun.findFirst({ where: { eventId: input.eventId, idempotencyKey: input.idempotencyKey }, select: { id: true, requestHash: true } })
    if (again) return again.requestHash === requestHash ? { ok: true, runId: again.id, replay: true, notice: null } : { ok: false, status: 409, error: "Cette proposition a déjà été lancée avec d'autres choix : rechargez la page.", code: "key_reused" }
    return { ok: false, status: 409, error: "Une proposition est déjà en cours pour cet événement : attendez qu'elle finisse ou arrêtez-la.", code: "active" }
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
export async function drainProposalRuns(opts: { deadlineMs?: number; wait?: boolean; maxAttempts?: number } = {}): Promise<void> {
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

/** Renews the lease alone (no progress to report); false when the attempt is no longer current. */
async function renewLease(c: Claimed): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE "ProposalRun" SET "leaseExpiresAt" = clock_timestamp() + make_interval(secs => ${LEASE_SECONDS}), "updatedAt" = clock_timestamp()
    WHERE id = ${c.id} AND "leaseToken" = ${c.leaseToken} AND status = 'running' AND "leaseExpiresAt" > clock_timestamp()`
  return n > 0
}

/**
 * Ends an attempt with its lease kept alive until the end: renewed once first (the search's last
 * heartbeat can be seconds old, and the report was built synchronously since), then every heartbeat
 * while the write waits for its locks, one renewal at a time, so a slow tail never silently drops a
 * finished result. Nothing is ended when the lease is already lost (the next read reports it).
 * Exported for tests.
 */
export async function finishWithLease(c: Claimed, finish: () => Promise<void>): Promise<boolean> {
  if (!(await renewLease(c))) return false
  let inFlight = false
  const timer = setInterval(() => {
    if (inFlight) return
    inFlight = true
    // A renewal waiting on the run row locked by the write finds it ended, and changes nothing.
    renewLease(c).catch((e) => console.error("proposal lease renewal failed", e)).finally(() => { inFlight = false })
  }, HEARTBEAT_MS)
  try {
    await finish()
  } finally {
    clearInterval(timer)
  }
  return true
}

/** At most this many seeds for one « Proposer une autre répartition », within the run's deadline. */
export const MAX_ALTERNATIVE_ATTEMPTS = 20

/**
 * Computes a claimed run and ends it (fenced). Exported for tests, which interleave other writes
 * with it. An alternative (« Proposer une autre répartition ») tries seed after seed on the same
 * frozen input, within one deadline, until its result differs from every earlier finished run with
 * the same choices; only then it writes, with the seed that gave it (Codex 2026-10-31). Nothing
 * different: nothing written, the drafts untouched (`no_other`).
 */
export async function executeRun(c: Claimed, opts: { deadlineMs?: number; wait?: boolean; maxAttempts?: number } = {}): Promise<void> {
  const deadlineAt = performance.now() + (opts.deadlineMs ?? PROPOSAL_DEADLINE_MS)
  const run = await prisma.proposalRun.findUnique({ where: { id: c.id }, select: { snapshot: true, alternative: true, configuration: true, event: { select: { organizationId: true } } } })
  if (!run?.snapshot || !run.event.organizationId) {
    await prisma.$executeRaw`UPDATE "ProposalRun" SET status = 'failed', "stopReason" = 'error', "leaseToken" = NULL, "finishedAt" = now(), "updatedAt" = now() WHERE id = ${c.id} AND "leaseToken" = ${c.leaseToken}`
    return
  }
  const db = getOrgClient(run.event.organizationId)
  const input = run.snapshot as unknown as ProposalInput
  let lost = false
  let cancel = false
  let last = performance.now()
  const seedsTried: number[] = []
  const progressOf = (p: { evaluations: number; iterations: number }, stage: string) => (run.alternative ? { ...p, stage, seedsTried } : { ...p, stage })
  /** One search on the frozen input with this seed, within what is left of the deadline. */
  async function attempt(seed: number): Promise<{ outcome: SolveOutcome; search: ProposalSearch } | null> {
    // An alternative breaks the construction's ties by its seed (src/lib/proposal-solver.ts `diversify`).
    const attemptInput: ProposalInput = run!.alternative ? { ...input, seed, diversify: true } : { ...input, seed }
    const search = new ProposalSearch(attemptInput)
    try {
      const outcome = await runProposalSearch(attemptInput, {
        search,
        deadlineMs: Math.max(0, deadlineAt - performance.now()),
        shouldStop: () => lost || cancel,
        onProgress: async (p) => {
          if (performance.now() - last < HEARTBEAT_MS) return
          last = performance.now()
          const beat = await heartbeat(c, progressOf(p, search.stage))
          if (!beat) lost = true
          else if (beat.cancelRequested) cancel = true
        },
      })
      return { outcome, search }
    } catch (e) {
      console.error("proposal search failed", e)
      await prisma.$executeRaw`UPDATE "ProposalRun" SET status = 'failed', "stopReason" = 'error', "leaseToken" = NULL, "finishedAt" = now(), "updatedAt" = now() WHERE id = ${c.id} AND "leaseToken" = ${c.leaseToken}`
      return null
    }
  }

  if (!run.alternative) {
    const done = await attempt(input.seed)
    if (!done || lost) return
    const report = buildReport(done.search.model, done.outcome)
    await finishWithLease(c, () => completeRun(db, c, done.outcome, report))
    return
  }

  // The earlier results to differ from, and every seed already tried with these choices.
  const config = proposalConfigSchema.safeParse(run.configuration)
  const others = config.success ? (await sameChoiceRuns(db, c.eventId, choicesKey(config.data))).filter((r) => r.id !== c.id) : []
  const avoid = new Set(others.filter((r) => r.assignments).map((r) => assignmentSet(r.assignments)))
  const tried = others.flatMap((r) => r.seeds)
  const found = await findAlternative({
    firstSeed: input.seed, tried, avoid,
    maxAttempts: opts.maxAttempts ?? MAX_ALTERNATIVE_ATTEMPTS,
    timeLeft: () => deadlineAt - performance.now(),
    beforeAttempt: async (list) => {
      seedsTried.splice(0, seedsTried.length, ...list)
      // Each seed is recorded before its search (a lost attempt never tries it again unseen).
      const beat = await heartbeat(c, progressOf({ evaluations: 0, iterations: 0 }, "setup"))
      if (!beat) { lost = true; return false }
      if (beat.cancelRequested) { cancel = true; return false }
      await new Promise<void>((resolve) => setImmediate(resolve))
      return true
    },
    attempt: async (seed) => {
      const done = await attempt(seed)
      if (!done || lost || cancel) return null
      return { execution: done.outcome.execution, assignments: done.outcome.assignments, value: done }
    },
  })
  if (lost) return
  if (found.kind === "found") {
    const { outcome, search } = found.value
    const report = buildReport(search.model, outcome)
    await finishWithLease(c, () => completeRun(db, c, outcome, report, { seed: found.seed, snapshot: { ...input, seed: found.seed, diversify: true }, seedsTried: found.seedsTried }))
    return
  }
  // A failed search already ended the run as failed.
  if (found.kind === "stopped" && !cancel) return
  // Nothing different (or stopped): nothing written, the drafts as they are. A stop asked meanwhile wins.
  const progress = JSON.stringify({ evaluations: 0, iterations: 0, stage: "done", seedsTried })
  const reason = cancel ? "cancelled" : "no_other"
  await prisma.$executeRaw`
    UPDATE "ProposalRun" SET
      status = CASE WHEN ${reason} = 'cancelled' OR "cancelRequestedAt" IS NOT NULL THEN 'interrupted' ELSE 'finished' END,
      "stopReason" = CASE WHEN ${reason} = 'cancelled' OR "cancelRequestedAt" IS NOT NULL THEN 'cancelled' ELSE 'no_other' END,
      result = NULL, outcome = NULL, "leaseToken" = NULL, progress = ${progress}::jsonb, "finishedAt" = now(), "updatedAt" = now()
    WHERE id = ${c.id} AND "leaseToken" = ${c.leaseToken} AND status = 'running' AND "leaseExpiresAt" > now()`
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

/**
 * Locks the run row, last in the global order, and says whether its lease still holds at that
 * moment: `clock_timestamp()`, not `now()`, which is the start of the transaction, before every
 * lock wait (a lease that ran out while the write waited for its locks would still pass). Exported
 * for tests.
 */
export async function lockRun(tx: Tx, runId: string): Promise<RunRow | null> {
  const rows = await tx.$queryRaw<RunRow[]>`
    SELECT id, "eventId", status, "leaseToken", "cancelRequestedAt", "writtenAt", "createdById", configuration, replacement, result, written,
      ("leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" > clock_timestamp()) AS "leaseValid"
    FROM "ProposalRun" WHERE id = ${runId} FOR UPDATE`
  return rows[0] ?? null
}

/** The end of an attempt: interrupted (stored, nothing written) or finished (written into drafts). Fenced. */
async function completeRun(db: Db, c: Claimed, outcome: SolveOutcome, report: ProposalReport, accepted?: { seed: number; snapshot: ProposalInput; seedsTried: number[] }): Promise<void> {
  const result = resultOf(outcome, report)
  await db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const peek = await tx.proposalRun.findFirst({ where: { id: c.id }, select: { configuration: true, replacement: true } })
    if (!peek) return
    const write = outcome.execution === "finished"
    const locked = write ? await lockForWrite(tx, c.eventId, outcome.assignments, peek.replacement as Replacement) : true
    const locked2 = await lockRun(tx, c.id)
    if (!locked2 || locked2.status !== "running" || locked2.leaseToken !== c.leaseToken || !locked2.leaseValid || !locked) return
    // An alternative's accepted seed is stored with its result, atomically: the run replays as written.
    const run = accepted ? { ...locked2, configuration: { ...(locked2.configuration as object), seed: accepted.seed } } : locked2
    const seedData = accepted
      ? { seed: accepted.seed, configuration: run.configuration as object, snapshot: accepted.snapshot as object, progress: { evaluations: outcome.evaluations, iterations: outcome.iterations, stage: "done", seedsTried: accepted.seedsTried } }
      : {}
    const base = { result: result as object, solverVersion: outcome.solverVersion, outcome: report.outcome, leaseToken: null, finishedAt: new Date(), ...seedData }
    if (!write || run.cancelRequestedAt) {
      // An alternative never keeps a partial result to write: stopped, it is only stopped.
      const kept = accepted ? { result: Prisma.DbNull, outcome: null } : {}
      await tx.proposalRun.updateMany({ where: { id: c.id }, data: { ...base, ...kept, status: "interrupted", stopReason: run.cancelRequestedAt ? "cancelled" : outcome.stopReason } })
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
  // The answer of the dates that reach each shift, in the event's frozen zone (src/lib/draft-assignments.ts).
  const gate = await readAvailabilityGate(tx as never, run.eventId)
  const stampZone = gate.inUse ? gate.timeZone : null
  const created: { draftId: string; shiftId: string; volunteerId: string }[] = []
  for (const a of kept) {
    const row = await tx.draftAssignment.create({
      data: {
        eventId: run.eventId, shiftId: a.shiftId, volunteerId: a.volunteerId, source: "proposal", proposalRunId: run.id, createdById: run.createdById,
        shiftTerms: draftShiftTerms(shiftOf.get(a.shiftId)! as never), availabilityStamp: stampZone ? draftAvailabilityStamp(answers.get(a.volunteerId) ?? null, shiftOf.get(a.shiftId)!, stampZone) : availabilityStamp(answers.get(a.volunteerId) ?? null),
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
    const peek = await tx.proposalRun.findFirst({ where: { id: input.runId, eventId: input.eventId }, select: { result: true, replacement: true, writtenAt: true, writtenCount: true, droppedCount: true, alternative: true, status: true } })
    if (!peek) return { ok: false as const, status: 404 as const, error: "Proposition introuvable.", code: "not_found" }
    if (peek.writtenAt) return { ok: true as const, replay: true, writtenCount: peek.writtenCount, droppedCount: peek.droppedCount }
    // An alternative writes only a complete result that differs from the earlier ones, never a partial one.
    if (peek.alternative && peek.status !== "finished") return { ok: false as const, status: 409 as const, error: "Cette proposition n'a pas de résultat à écrire.", code: "no_result" }
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
  const ordinals = await runOrdinals(db, eventId)
  const sameAs = run.status === "finished" && run.inputHash !== SCRUBBED_HASH ? await sameResultAs(db, eventId, run, ordinals) : null
  return {
    id: run.id, status: run.status, stopReason: run.stopReason, outcome: run.outcome, ordinal: ordinals.get(run.id) ?? 0, sameAs, createdAt: run.createdAt, startedAt: run.startedAt,
    finishedAt: run.finishedAt, writtenAt: run.writtenAt, writtenCount: run.writtenCount, droppedCount: run.droppedCount, progress: run.progress,
    configuration: run.configuration, report: ((run.result as { report?: ProposalReport } | null)?.report) ?? null, written: run.written, stale,
    cancelRequested: !!run.cancelRequestedAt,
  }
}

/** The event's latest runs, newest first, without their payloads, each with its ordinal. */
export async function listRuns(db: Db, eventId: string, take = 10) {
  await expireRuns(db, eventId)
  const [runs, ordinals] = await Promise.all([
    db.proposalRun.findMany({
      where: { eventId },
      select: { id: true, status: true, stopReason: true, outcome: true, createdAt: true, finishedAt: true, writtenAt: true, writtenCount: true, droppedCount: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    }),
    runOrdinals(db, eventId),
  ])
  return runs.map((r) => ({ ...r, ordinal: ordinals.get(r.id) ?? 0 }))
}

/** Each run's rank among all the event's runs, oldest first, by (createdAt, id): « Proposition 1 », « 2 »… */
export async function runOrdinals(db: Pick<Db, "$queryRaw">, eventId: string): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ id: string; n: number }[]>`
    SELECT id, (row_number() OVER (ORDER BY "createdAt", id))::int AS n FROM "ProposalRun" WHERE "eventId" = ${eventId}`
  return new Map(rows.map((r) => [r.id, Number(r.n)]))
}

/**
 * The ordinal of the first earlier run with the same choices, the same data (input hash), the same
 * solver and another seed whose search found exactly the same assignments; null when there is none.
 * Scrubbed runs never count.
 */
async function sameResultAs(db: Db, eventId: string, run: { id: string; seed: number; configuration: unknown; inputHash: string; result: unknown }, ordinals: Map<string, number>): Promise<number | null> {
  const own = proposalConfigSchema.safeParse(run.configuration)
  const mine = run.result as { assignments?: { shiftId: string; volunteerId: string }[]; solverVersion?: string } | null
  if (!own.success || !mine?.assignments) return null
  const rows = await db.$queryRaw<{ id: string; configuration: unknown; assignments: { shiftId: string; volunteerId: string }[] | null; solverVersion: string | null }[]>`
    SELECT id, configuration, result->'assignments' AS assignments, result->>'solverVersion' AS "solverVersion"
    FROM "ProposalRun"
    WHERE "eventId" = ${eventId} AND id <> ${run.id} AND status = 'finished' AND "inputHash" = ${run.inputHash} AND seed <> ${run.seed} AND result IS NOT NULL`
  const key = choicesKey(own.data)
  const target = assignmentSet(mine.assignments)
  const self = ordinals.get(run.id) ?? 0
  const matches = rows.filter((r) => {
    const n = ordinals.get(r.id) ?? 0
    if (n === 0 || n >= self || r.solverVersion !== (mine.solverVersion ?? null)) return false
    const c = proposalConfigSchema.safeParse(r.configuration)
    return c.success && choicesKey(c.data) === key && assignmentSet(r.assignments) === target
  }).map((r) => ordinals.get(r.id)!)
  return matches.length > 0 ? Math.min(...matches) : null
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

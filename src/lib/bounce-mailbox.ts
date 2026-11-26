// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ImapFlow, type SearchObject } from "imapflow"
import type { PrismaClient } from "@/generated/prisma/client"
import { prisma } from "./prisma"
import { env } from "./env"
import { reportError } from "./report-error"
import { addressHash } from "./notifications/smtp-outcome"
import { outboxMessageHost } from "./notifications/outbox-message-id"
import { bounceMailboxConfigFrom, type BounceMailboxConfig } from "./bounce-mailbox-config"
import { DAY_MS, RETENTION_DAYS, daysAgo } from "./retention"
import { enhancedStatusOfDiagnostic, isPermanentFailure, outboxIdFromMessageId, parseBounceDsn, responseCodeOfDiagnostic, directRefFromMessageId, type DsnRecipient, type ParsedBounce } from "./bounce-dsn"

/**
 * Deferred bounces (#602): the IMAP side. A scheduled run reads the mailbox that receives Gandi's
 * delivery status notifications, correlates each permanent failure with the outbox row it belongs
 * to, records the same `rejected_permanent` outcome the synchronous refusal records (#598), and
 * moves the processed DSN out of the inbox. Auto-replies, read receipts, forged messages and
 * anything it cannot correlate stay where they are, counted only: the owner reads this mailbox.
 *
 * Raw messages are parsed in memory and never written to the database or the logs: logs carry
 * counts only, and Sentry gets connection, authentication or mailbox errors, never the password.
 */

export type BounceVerdict = "flagged" | "already_known" | "ignored_temporary" | "ignored" | "uncorrelated"

export type BounceScanCounts = {
  scanned: number
  flagged: number
  alreadyKnown: number
  ignoredTemporary: number
  /** Auto-replies, read receipts and ordinary mail: not a DSN, left in INBOX, counted apart. */
  ignored: number
  uncorrelated: number
  errors: number
}

export type BounceScanResult = BounceScanCounts & { processedFolder: string }

export const MAX_BOUNCES_PER_RUN = 200

const ZERO_COUNTS: BounceScanCounts = { scanned: 0, flagged: 0, alreadyKnown: 0, ignoredTemporary: 0, ignored: 0, uncorrelated: 0, errors: 0 }

/** The IMAP surface this module uses; a test supplies a plain object instead of a connection. */
export type BounceImapClient = {
  connect(): Promise<void>
  list(): Promise<{ path: string }[]>
  mailboxCreate(path: string): Promise<unknown>
  getMailboxLock(path: string): Promise<{ release(): void }>
  search(query: SearchObject, options: { uid: true }): Promise<number[] | false | undefined>
  fetchOne(sequence: string, query: { source: true }, options: { uid: true }): Promise<{ source?: Buffer } | false>
  messageMove(range: number[], destination: string, options: { uid: true }): Promise<unknown>
  logout(): Promise<void>
}

export type BounceScanDeps = {
  /** Test seam: the real one opens an IMAPS connection with certificate verification on. */
  createClient?: (config: BounceMailboxConfig) => BounceImapClient
  /** One message's classification; a test can answer without a database. */
  analyze?: (raw: Buffer) => Promise<BounceVerdict>
}

/**
 * Content-Type multipart/report covers standard DSNs (and read receipts, rejected by the parser);
 * multipart/mixed covers the common non-standard bounces that carry the same delivery-status
 * block. The search is a coarse filter only: the parser decides, and non-DSN messages stay put.
 */
const SEARCH_QUERY: SearchObject = {
  or: [
    { header: { "Content-Type": "multipart/report" } },
    { header: { "Content-Type": "multipart/mixed" } },
  ],
}

function defaultClient(config: BounceMailboxConfig): BounceImapClient {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true, // IMAPS only
    tls: { rejectUnauthorized: true },
    auth: { user: config.user, pass: config.password },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  }) as unknown as BounceImapClient
}

/** Sort an IMAP search answer into a bounded, unique, oldest-first list of UIDs. */
export function uidsToScan(found: number[] | false | undefined, limit = MAX_BOUNCES_PER_RUN): number[] {
  if (!Array.isArray(found)) return []
  return [...new Set(found)].sort((a, b) => a - b).slice(0, limit)
}

/**
 * One mailbox pass: ensure the processed folder exists, read INBOX, classify each fetched
 * message, move the DSNs that were acted on or already known (and the temporary ones that belong
 * to us). Nothing is moved for an uncorrelated message, an auto-reply or a read receipt.
 */
export async function scanBounceMailbox(config: BounceMailboxConfig, deps: BounceScanDeps = {}): Promise<BounceScanResult> {
  if (!deps.analyze) throw new Error("scanBounceMailbox requires an analyze function")
  const analyze = deps.analyze
  const client = (deps.createClient ?? defaultClient)(config)
  const counts: BounceScanCounts = { ...ZERO_COUNTS }
  let lock: { release(): void } | null = null

  try {
    await client.connect()
    // The folder is created once; an existing one is left alone. A listing or creation failure is
    // not fatal: the moves below report the real problem (a refused move is counted, and the DSN
    // stays in the inbox for the next run).
    const folders = await client.list().catch(() => [])
    if (!folders.some((folder) => folder.path === config.processedFolder)) {
      await client.mailboxCreate(config.processedFolder).catch(() => undefined)
    }

    lock = await client.getMailboxLock("INBOX")
    const found = await client.search(SEARCH_QUERY, { uid: true })
    if (found === false) counts.errors++ // the server refused the search; no message was read
    const uids = uidsToScan(found)

    for (const uid of uids) {
      counts.scanned++
      let raw: Buffer | undefined
      try {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true })
        raw = message ? message.source : undefined
      } catch {
        counts.errors++
        continue
      }
      if (!raw) {
        counts.errors++
        continue
      }

      let verdict: BounceVerdict
      try {
        verdict = await analyze(raw)
      } catch {
        counts.errors++
        continue
      }

      switch (verdict) {
        case "flagged": counts.flagged++; break
        case "already_known": counts.alreadyKnown++; break
        case "ignored_temporary": counts.ignoredTemporary++; break
        case "ignored": counts.ignored++; break
        case "uncorrelated": counts.uncorrelated++; break
      }

      // Every DSN that concerns this deployment leaves the inbox; everything else stays for the
      // owner. A move failure is counted, and the next run sees the same message (idempotent).
      if (verdict !== "uncorrelated" && verdict !== "ignored") {
        try {
          const moved = await client.messageMove([uid], config.processedFolder, { uid: true })
          if (moved === false) counts.errors++ // the server refused the move; the DSN stays for the next run
        } catch {
          counts.errors++
        }
      }
    }
  } finally {
    if (lock) lock.release()
    await client.logout().catch(() => undefined)
  }

  return { ...counts, processedFolder: config.processedFolder }
}

type BounceOutcomeRow = {
  addressHash: string | null
  outcome: string
  organizationId: string | null
  volunteerId: string | null
  kind: string
  createdAt: Date
}

/** The two id forms a notice can be correlated by; both null for a pre-fix direct send. */
type BounceOutcomeIds = {
  outboxId: string | null
  messageRef: string | null
}

/** A known send is correlated by exactly one non-null id form. */
type KnownSendIds = { outboxId: string; messageRef: null } | { outboxId: null; messageRef: string }

/**
 * End of the bounded exception for direct sends made before the `<direct-…>` fix (#602).
 * DELETE THIS WHOLE PATH, ITS CONSTANT AND ITS TESTS after this date: the DeliveryOutcome rows it
 * matches are purged by the nightly cleanup after RETENTION_DAYS.deliveryOutcome (30 days), so
 * none can still exist by then, and the exception has no reason to live on.
 *
 * Security: a forged notice sent to the mailbox can, through this path, only flag an address to
 * which this deployment really sent a direct email in the retention window; the effect is the
 * mention « Adresse à vérifier » for that member's own organisation. That is why the path is
 * bounded in time and limited to pre-fix rows (no outboxId, no messageRef): since the fix every
 * direct send of a recorded kind stores a messageRef, so such a row can only predate it.
 */
export const LEGACY_DIRECT_BOUNCES_UNTIL = new Date("2026-12-31T23:59:59Z")

/** When a DSN lists several recipients with different fates, the message-level verdict keeps the strongest. */
function strongerVerdict(current: BounceVerdict, next: BounceVerdict): BounceVerdict {
  const rank: Record<BounceVerdict, number> = { uncorrelated: 0, ignored: 1, ignored_temporary: 2, already_known: 3, flagged: 4 }
  return rank[next] > rank[current] ? next : current
}

/**
 * The id fields of the row a permanent bounce writes. Each path keeps its own row shape: an
 * outbox send carries its row id, a direct send its reference and a null outboxId, and the
 * legacy path is explicit that both are null.
 */
function outcomeIdFields(ids: BounceOutcomeIds): { outboxId?: string | null; messageRef?: string | null } {
  if (ids.messageRef) return { outboxId: null, messageRef: ids.messageRef }
  if (ids.outboxId) return { outboxId: ids.outboxId }
  return { outboxId: null, messageRef: null }
}

type PermanentBounce = {
  ids: BounceOutcomeIds
  organizationId: string | null
  volunteerId: string | null
  kind: string
  addressHash: string
  recipient: DsnRecipient
}

/**
 * The `rejected_permanent` row shared by the three correlation paths. The organisation, member,
 * kind and address hash always come from our own rows, never from the notice.
 *
 * A write failure is not "uncorrelated": the DSN is ours, it just was not recorded, and the
 * message stays in the inbox for the next run. Let it throw so the scan counts an error.
 */
async function recordPermanentBounce(db: PrismaClient, bounce: PermanentBounce): Promise<void> {
  await db.deliveryOutcome.create({
    data: {
      // The matched row's organisation only: a DSN never chooses a tenant.
      organizationId: bounce.organizationId,
      volunteerId: bounce.volunteerId ?? null,
      ...outcomeIdFields(bounce.ids),
      kind: bounce.kind,
      outcome: "rejected_permanent",
      reason: "bounced_after_acceptance",
      responseCode: responseCodeOfDiagnostic(bounce.recipient.diagnosticCode),
      enhancedStatus: bounce.recipient.status ?? enhancedStatusOfDiagnostic(bounce.recipient.diagnosticCode),
      addressHash: bounce.addressHash,
    },
  })
}

/** Idempotent per (send, address): a permanent failure already recorded for that address wins. */
function hasRejectedPermanent(outcomes: BounceOutcomeRow[], hash: string): boolean {
  return outcomes.some((outcome) => outcome.addressHash === hash && outcome.outcome === "rejected_permanent")
}

/**
 * Correlate one parsed DSN with the rows of a send identified by an outbox row id or a direct
 * reference, then record the permanent failure once. An outbox send also reads its queue row
 * (organisation fallback); a direct send has none, so only its own outcomes decide the
 * organisation.
 */
async function analyzeKnownSend(
  parsed: ParsedBounce,
  opts: { secret: string; db: PrismaClient },
  ids: KnownSendIds,
): Promise<BounceVerdict> {
  const { outboxId, messageRef } = ids
  // The key is built explicitly, never as a nullable filter: `{ messageRef: null }` would match
  // every legacy row (the address-only fallback the design forbids), and a missing filter would
  // read the whole table.
  const outcomeKey: { outboxId: string } | { messageRef: string } =
    ids.outboxId !== null ? { outboxId: ids.outboxId } : { messageRef: ids.messageRef }

  const [outbox, outcomes] = await Promise.all([
    outboxId
      ? opts.db.notificationOutbox.findUnique({ where: { id: outboxId }, select: { id: true, organizationId: true } })
      : Promise.resolve(null),
    opts.db.deliveryOutcome.findMany({
      where: outcomeKey,
      orderBy: { createdAt: "desc" },
      select: { addressHash: true, outcome: true, organizationId: true, volunteerId: true, kind: true, createdAt: true },
    }),
  ])
  if (outcomes.length === 0) return "uncorrelated"

  const byHash = new Map<string, BounceOutcomeRow>()
  for (const outcome of outcomes as BounceOutcomeRow[]) {
    if (outcome.addressHash && !byHash.has(outcome.addressHash)) byHash.set(outcome.addressHash, outcome)
  }

  let verdict: BounceVerdict = "uncorrelated"
  for (const recipient of parsed.recipients) {
    const hash = addressHash(recipient.finalRecipient, opts.secret)
    const matched = byHash.get(hash)
    if (!matched) continue

    if (!isPermanentFailure(recipient)) {
      verdict = strongerVerdict(verdict, "ignored_temporary")
      continue
    }
    // Idempotent per (outbox row or direct reference, address): a second DSN for the same
    // refusal writes nothing.
    if (hasRejectedPermanent(outcomes as BounceOutcomeRow[], hash)) {
      verdict = strongerVerdict(verdict, "already_known")
      continue
    }

    await recordPermanentBounce(opts.db, {
      ids: { outboxId, messageRef },
      organizationId: outbox?.organizationId ?? matched.organizationId ?? null,
      volunteerId: matched.volunteerId,
      kind: matched.kind,
      addressHash: hash,
      recipient,
    })
    verdict = strongerVerdict(verdict, "flagged")
  }
  return verdict
}

/** One (organisation, member) pair a legacy notice can still be attributed to. */
type LegacyDirectPair = {
  organizationId: string | null
  volunteerId: string
  kind: string
  createdAt: Date
}

/**
 * Whether a legacy bounce was already recorded for this (organisation, member) pair after the
 * pair's accepted row. A member belongs to one organisation, but the pair is written out in full:
 * the idempotency key is the pair, never the address alone.
 */
async function legacyBounceAlreadyKnown(db: PrismaClient, hash: string, pair: LegacyDirectPair): Promise<boolean> {
  const existing = await db.deliveryOutcome.findFirst({
    where: {
      addressHash: hash,
      outboxId: null,
      messageRef: null,
      outcome: "rejected_permanent",
      reason: "bounced_after_acceptance",
      organizationId: pair.organizationId,
      volunteerId: pair.volunteerId,
      createdAt: { gt: pair.createdAt },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  })
  return existing !== null
}

/**
 * The bounded exception for direct sends made before the `<direct-…>` fix: their Message-ID was
 * random, so the only link left is the address. Only a permanent failure is considered. For each
 * distinct (organisation, member) that received a pre-fix direct email at that address within the
 * retention window, its most recent accepted row stands in for the send; the notice's own
 * Message-ID host is never trusted for anything. Temporary statuses write nothing and are not
 * looked up.
 *
 * Every pair is handled, not only the latest row for the address: the same address can appear in
 * two organisations, and the refusal concerns each member who really wrote to it. The reads are
 * ordered (`createdAt` desc, then `id` desc) so the pair chosen never depends on insertion order.
 *
 * This path ends by itself at LEGACY_DIRECT_BOUNCES_UNTIL. Before it, a row can only be a
 * pre-fix direct send; after it, the path is skipped without a query.
 */
async function analyzeLegacyDirectBounce(
  parsed: ParsedBounce,
  opts: { secret: string; db: PrismaClient; now: Date },
): Promise<BounceVerdict> {
  if (opts.now.getTime() > LEGACY_DIRECT_BOUNCES_UNTIL.getTime()) return "uncorrelated"
  const since = daysAgo(opts.now, RETENTION_DAYS.deliveryOutcome)

  let verdict: BounceVerdict = "uncorrelated"
  for (const recipient of parsed.recipients) {
    if (!isPermanentFailure(recipient)) continue
    const hash = addressHash(recipient.finalRecipient, opts.secret)
    // A row without an outboxId, a messageRef or a member, accepted by the relay in the
    // retention window, can only be a direct send made before the fix.
    const rows = await opts.db.deliveryOutcome.findMany({
      where: {
        addressHash: hash,
        outboxId: null,
        messageRef: null,
        outcome: "accepted_by_relay",
        volunteerId: { not: null },
        createdAt: { gte: since },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { organizationId: true, volunteerId: true, kind: true, createdAt: true },
    })

    // Rows come newest first: the first row of each pair is the one whose kind is written.
    const pairs = new Map<string, LegacyDirectPair>()
    for (const row of rows) {
      if (!row.volunteerId) continue
      const key = `${row.organizationId ?? ""}\u0000${row.volunteerId}`
      if (pairs.has(key)) continue
      pairs.set(key, {
        organizationId: row.organizationId,
        volunteerId: row.volunteerId,
        kind: row.kind,
        createdAt: row.createdAt,
      })
    }
    if (pairs.size === 0) continue

    let wrote = false
    for (const pair of pairs.values()) {
      // Idempotent per (organisation, member, address): a second notice writes nothing for a
      // pair already recorded, and still flags the pairs that were not.
      if (await legacyBounceAlreadyKnown(opts.db, hash, pair)) continue

      await recordPermanentBounce(opts.db, {
        ids: { outboxId: null, messageRef: null },
        organizationId: pair.organizationId,
        volunteerId: pair.volunteerId,
        kind: pair.kind,
        addressHash: hash,
        recipient,
      })
      wrote = true
    }
    verdict = strongerVerdict(verdict, wrote ? "flagged" : "already_known")
  }
  return verdict
}

/**
 * Correlate one parsed DSN with the rows of the send it answers, then record the permanent
 * failure once. An outbox send is found by its row id, a direct send by the random reference of
 * its Message-ID. A notice carrying neither form takes the bounded legacy path above. In every
 * case the organisation, member, kind and address hash come only from our own rows, never from
 * the message: a forged DSN can at most flag an address we already wrote to.
 */
export async function analyzeBounceDsn(
  parsed: ParsedBounce,
  opts: { host: string; secret: string; db?: PrismaClient; now?: Date },
): Promise<BounceVerdict> {
  // Not a DSN at all (auto-reply, read receipt, ordinary mail): leave it in INBOX, counted apart
  // from the DSNs that look like ours but cannot be correlated.
  if (!parsed.isDsn) return "ignored"
  if (!parsed.originalMessageId) return "uncorrelated"

  const db = opts.db ?? prisma
  const outboxId = outboxIdFromMessageId(parsed.originalMessageId, opts.host)
  if (outboxId) return analyzeKnownSend(parsed, { secret: opts.secret, db }, { outboxId, messageRef: null })
  const messageRef = directRefFromMessageId(parsed.originalMessageId, opts.host)
  // An id of one of our two forms never falls through to the legacy path, even when its own
  // lookup finds nothing.
  if (messageRef) return analyzeKnownSend(parsed, { secret: opts.secret, db }, { outboxId: null, messageRef })
  return analyzeLegacyDirectBounce(parsed, { secret: opts.secret, db, now: opts.now ?? new Date() })
}

const BOUNCE_JOB = "bounces"
const STALE_RUN_MS = 20 * 60 * 1000

/**
 * The analyzer a scheduled run gives to the mailbox scan. The run's own clock is bound here so the
 * bounded legacy path ends on that run's time, not on a second `new Date()` taken later.
 */
export function deferredBounceAnalyzer(opts: { db: PrismaClient; now: Date }): (raw: Buffer) => Promise<BounceVerdict> {
  return (raw) =>
    parseBounceDsn(raw).then((parsed) => analyzeBounceDsn(parsed, { host: outboxMessageHost(), secret: env.AUTH_SECRET, db: opts.db, now: opts.now }))
}

type UncorrelatedRun = { at: string; count: number }

function recentUncorrelated(summary: unknown, now: Date): UncorrelatedRun[] {
  const raw = (summary as { uncorrelatedRuns?: unknown } | null)?.uncorrelatedRuns
  if (!Array.isArray(raw)) return []
  const cutoff = now.getTime() - DAY_MS
  const runs: UncorrelatedRun[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const at = (entry as { at?: unknown }).at
    const count = (entry as { count?: unknown }).count
    if (typeof at !== "string" || typeof count !== "number" || !Number.isFinite(count) || count < 0) continue
    const time = Date.parse(at)
    if (!Number.isFinite(time) || time < cutoff) continue
    runs.push({ at: new Date(time).toISOString(), count })
  }
  return runs
}

/** Whether this run took the job: a row that is not running, or one abandoned for over 20 minutes. */
async function claimBounceRun(db: PrismaClient, now: Date): Promise<boolean> {
  try {
    await db.jobRun.create({ data: { job: BOUNCE_JOB, startedAt: now, finishedAt: null, ok: null, error: null } })
    return true
  } catch {
    const { count } = await db.jobRun.updateMany({
      where: {
        job: BOUNCE_JOB,
        OR: [{ finishedAt: { not: null } }, { startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) } }],
      },
      data: { startedAt: now, finishedAt: null, ok: null, error: null },
    })
    return count === 1
  }
}

export type DeferredBounceRun = BounceScanCounts & {
  configured: boolean
  skipped?: "not_configured" | "overlap"
  processedFolder?: string
  uncorrelated24h?: number
  error?: string
}

export type ProcessDeferredBouncesDeps = {
  db?: PrismaClient
  /** Test seam: defaults to the environment; null means « not configured ». */
  config?: BounceMailboxConfig | null
  now?: Date
  scan?: (config: BounceMailboxConfig) => Promise<BounceScanResult>
  report?: (error: unknown) => void
}

/**
 * One scheduled run. Without configuration it is a no-op. When another run is still in progress
 * it does nothing (the JobRun row is the guard); a run abandoned for over 20 minutes is taken
 * over. The run's counts are recorded in the JobRun summary, which the health page reads.
 */
export async function processDeferredBounces(deps: ProcessDeferredBouncesDeps = {}): Promise<DeferredBounceRun> {
  const config = deps.config !== undefined ? deps.config : bounceMailboxConfigFrom(process.env)
  if (!config) return { configured: false, skipped: "not_configured", ...ZERO_COUNTS }

  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const report = deps.report ?? reportError("deferred_bounces.scan")
  const previous = await db.jobRun.findUnique({ where: { job: BOUNCE_JOB }, select: { summary: true } }).catch(() => null)
  if (!(await claimBounceRun(db, now))) return { configured: true, skipped: "overlap", ...ZERO_COUNTS }

  let result: BounceScanResult
  let error: string | undefined
  try {
    result = deps.scan
      ? await deps.scan(config)
      : await scanBounceMailbox(config, { analyze: deferredBounceAnalyzer({ db, now }) })
  } catch (e) {
    report(e)
    result = { ...ZERO_COUNTS, errors: 1, processedFolder: config.processedFolder }
    // No raw error text: it may name a server or an address, and tells the operator nothing useful.
    error = "Lecture de la boîte des rejets impossible."
  }

  const recent = recentUncorrelated(previous?.summary, now)
  recent.push({ at: now.toISOString(), count: result.uncorrelated })
  // Uncorrelated messages stay in INBOX (the owner reads them), so every run sees them again.
  // The 24 h figure is the high-water mark of the recent runs, not their sum, which would grow
  // by the same message every 15 minutes.
  const uncorrelated24h = recent.reduce((max, run) => Math.max(max, run.count), 0)
  const summary = { ...result, uncorrelated24h, uncorrelatedRuns: recent }

  await db.jobRun.update({
    where: { job: BOUNCE_JOB },
    data: { finishedAt: new Date(), ok: error === undefined, error: error ?? null, summary },
  })

  return { configured: true, ...result, uncorrelated24h, ...(error ? { error } : {}) }
}

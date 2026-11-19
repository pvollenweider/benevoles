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
import { enhancedStatusOfDiagnostic, isPermanentFailure, outboxIdFromMessageId, parseBounceDsn, responseCodeOfDiagnostic, type ParsedBounce } from "./bounce-dsn"

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

/** When a DSN lists several recipients with different fates, the message-level verdict keeps the strongest. */
function strongerVerdict(current: BounceVerdict, next: BounceVerdict): BounceVerdict {
  const rank: Record<BounceVerdict, number> = { uncorrelated: 0, ignored: 1, ignored_temporary: 2, already_known: 3, flagged: 4 }
  return rank[next] > rank[current] ? next : current
}

/**
 * Correlate one parsed DSN with the outbox row and its already recorded outcomes, then record the
 * permanent failure once. The organisation, member, kind and address hash come only from our own
 * rows, never from the message: a forged DSN can at most flag an address we already wrote to.
 */
export async function analyzeBounceDsn(
  parsed: ParsedBounce,
  opts: { host: string; secret: string; db?: PrismaClient },
): Promise<BounceVerdict> {
  // Not a DSN at all (auto-reply, read receipt, ordinary mail): leave it in INBOX, counted apart
  // from the DSNs that look like ours but cannot be correlated.
  if (!parsed.isDsn) return "ignored"
  if (!parsed.originalMessageId) return "uncorrelated"
  const outboxId = outboxIdFromMessageId(parsed.originalMessageId, opts.host)
  if (!outboxId) return "uncorrelated"
  const db = opts.db ?? prisma

  const [outbox, outcomes] = await Promise.all([
    db.notificationOutbox.findUnique({ where: { id: outboxId }, select: { id: true, organizationId: true } }),
    db.deliveryOutcome.findMany({
      where: { outboxId },
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
    // Idempotent per (outbox row, address): a second DSN for the same refusal writes nothing.
    if (outcomes.some((outcome) => outcome.addressHash === hash && outcome.outcome === "rejected_permanent")) {
      verdict = strongerVerdict(verdict, "already_known")
      continue
    }

    // A write failure is not "uncorrelated": the DSN is ours, it just was not recorded, and the
    // message stays in the inbox for the next run. Let it throw so the scan counts an error.
    await db.deliveryOutcome.create({
      data: {
        // The matched row's organisation only: a DSN never chooses a tenant.
        organizationId: outbox?.organizationId ?? matched.organizationId ?? null,
        volunteerId: matched.volunteerId ?? null,
        outboxId,
        kind: matched.kind,
        outcome: "rejected_permanent",
        reason: "bounced_after_acceptance",
        responseCode: responseCodeOfDiagnostic(recipient.diagnosticCode),
        enhancedStatus: recipient.status ?? enhancedStatusOfDiagnostic(recipient.diagnosticCode),
        addressHash: hash,
      },
    })
    verdict = strongerVerdict(verdict, "flagged")
  }
  return verdict
}

const BOUNCE_JOB = "bounces"
const STALE_RUN_MS = 20 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

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
      : await scanBounceMailbox(config, {
          analyze: (raw) => parseBounceDsn(raw).then((parsed) => analyzeBounceDsn(parsed, { host: outboxMessageHost(), secret: env.AUTH_SECRET, db })),
        })
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

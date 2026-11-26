// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import type { PrismaClient } from "@/generated/prisma/client"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-characters-long" } }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => undefined }))

import { deferredBounceAnalyzer, processDeferredBounces, LEGACY_DIRECT_BOUNCES_UNTIL, type BounceScanResult } from "../bounce-mailbox"
import type { BounceMailboxConfig } from "../bounce-mailbox-config"

const config: BounceMailboxConfig = {
  host: "mail.gandi.net",
  port: 993,
  user: "notifications@benevol.app",
  password: "secret",
  processedFolder: "Rejets traités",
}
const NOW = new Date("2026-11-19T08:00:00Z")

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() }))
const db = { jobRun: mocks } as unknown as PrismaClient

const scanResult = (over: Partial<BounceScanResult> = {}): BounceScanResult => ({
  scanned: 3,
  flagged: 1,
  alreadyKnown: 1,
  ignoredTemporary: 0,
  ignored: 0,
  uncorrelated: 1,
  errors: 0,
  processedFolder: "Rejets traités",
  ...over,
})

const run = (deps: Parameters<typeof processDeferredBounces>[0] = {}) => processDeferredBounces({ db, config, now: NOW, ...deps })

describe("processDeferredBounces", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset()
    mocks.findUnique.mockResolvedValue(null)
    mocks.create.mockResolvedValue({})
    mocks.updateMany.mockResolvedValue({ count: 0 })
    mocks.update.mockResolvedValue({})
  })

  it("is a no-op when the mailbox is not configured", async () => {
    const result = await processDeferredBounces({ db, config: null, now: NOW })
    expect(result).toEqual({
      configured: false,
      skipped: "not_configured",
      scanned: 0,
      flagged: 0,
      alreadyKnown: 0,
      ignoredTemporary: 0,
      ignored: 0,
      uncorrelated: 0,
      errors: 0,
    })
    expect(mocks.findUnique).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("does nothing when another run holds the JobRun row", async () => {
    mocks.create.mockRejectedValueOnce(new Error("unique"))
    const scan = vi.fn()
    const result = await run({ scan })
    expect(result).toEqual({ configured: true, skipped: "overlap", scanned: 0, flagged: 0, alreadyKnown: 0, ignoredTemporary: 0, ignored: 0, uncorrelated: 0, errors: 0 })
    expect(scan).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("records the counts and the 24 h high-water mark of uncorrelated messages", async () => {
    mocks.findUnique.mockResolvedValue({
      summary: {
        uncorrelatedRuns: [
          { at: "2026-11-19T07:45:00Z", count: 2 },
          { at: "2026-11-17T07:00:00Z", count: 9 },
        ],
      },
    })
    const scan = vi.fn().mockResolvedValue(scanResult({ uncorrelated: 1 }))
    const result = await run({ scan })

    expect(result).toMatchObject({ configured: true, scanned: 3, flagged: 1, alreadyKnown: 1, uncorrelated: 1, uncorrelated24h: 2 })
    expect(mocks.create).toHaveBeenCalledOnce()
    const update = mocks.update.mock.calls[0][0]
    expect(update).toMatchObject({ where: { job: "bounces" }, data: { ok: true, error: null } })
    expect(update.data.summary).toMatchObject({ scanned: 3, flagged: 1, uncorrelated24h: 2 })
    expect(update.data.summary.uncorrelatedRuns).toEqual([
      { at: new Date("2026-11-19T07:45:00Z").toISOString(), count: 2 },
      { at: NOW.toISOString(), count: 1 },
    ])
  })

  it("takes over a run abandoned for over 20 minutes", async () => {
    mocks.create.mockRejectedValueOnce(new Error("unique"))
    mocks.updateMany.mockResolvedValue({ count: 1 })
    const scan = vi.fn().mockResolvedValue(scanResult())
    expect(await run({ scan })).toMatchObject({ configured: true, scanned: 3 })
    expect(scan).toHaveBeenCalledOnce()
  })

  it("binds the run's clock to the scan analyzer, so the bounded legacy path uses it", async () => {
    const outcome = { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() }
    const outcomeDb = { deliveryOutcome: outcome } as unknown as PrismaClient
    // A DSN whose original Message-ID is not one of this deployment's two forms.
    const raw = readFileSync(join(process.cwd(), "src/lib/__tests__/fixtures/bounces/forged-dsn-other-message-id.eml"))

    const now = new Date("2026-12-01T10:00:00Z")
    outcome.findMany.mockResolvedValue([
      { organizationId: "org-a", volunteerId: "vol-1", kind: "reminder_j1", createdAt: new Date("2026-11-15T08:00:00Z") },
    ])
    outcome.findFirst.mockResolvedValue(null)
    outcome.create.mockResolvedValue({})
    expect(await deferredBounceAnalyzer({ db: outcomeDb, now })(raw)).toBe("flagged")
    // The retention window is counted from the run's time, not from a second `new Date()`.
    expect(outcome.findMany.mock.calls[0][0].where.createdAt).toEqual({ gte: new Date("2026-11-01T10:00:00Z") })

    outcome.findMany.mockClear()
    outcome.findFirst.mockClear()
    outcome.create.mockClear()
    const after = new Date(LEGACY_DIRECT_BOUNCES_UNTIL.getTime() + 1)
    expect(await deferredBounceAnalyzer({ db: outcomeDb, now: after })(raw)).toBe("uncorrelated")
    expect(outcome.findMany).not.toHaveBeenCalled()
    expect(outcome.create).not.toHaveBeenCalled()
  })

  it("reports a mailbox/connection failure without recording the raw error text", async () => {
    const report = vi.fn()
    const scan = vi.fn().mockRejectedValue(new Error("AUTHENTICATIONFAILED notifications@benevol.app secret leaked?"))
    const result = await run({ scan, report })

    expect(report).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ configured: true, errors: 1, error: "Lecture de la boîte des rejets impossible." })
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ ok: false, error: "Lecture de la boîte des rejets impossible." })
    expect(JSON.stringify(mocks.update.mock.calls[0][0])).not.toContain("secret leaked")
  })
})

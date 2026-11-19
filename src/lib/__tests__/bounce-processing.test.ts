// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import type { PrismaClient } from "@/generated/prisma/client"

// bounce-mailbox imports the app's env and Prisma client for its scheduled entry point; these
// tests only call the pure correlation function with an explicit db.
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-characters-long" } }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => undefined }))

import { addressStatus } from "../address-status"
import { parseBounceDsn } from "../bounce-dsn"
import { analyzeBounceDsn } from "../bounce-mailbox"
import { addressHash } from "../notifications/smtp-outcome"

// Deferred bounces (#602): correlation, idempotency and the outcome created. The DSN fixtures are
// anonymised Gandi/Postfix and Microsoft 365 samples; nothing here opens a mailbox.

const HOST = "www.benevol.app"
const SECRET = "test-secret-at-least-32-characters-long"
const ORG = "org-a"
const VOLUNTEER = "vol-1"
const OUTBOX = "clx0000000000000000000001"
const RECIPIENT = "eleve.test@ecole-exemple.org"

const fixture = (name: string) => readFileSync(join(process.cwd(), "src/lib/__tests__/fixtures/bounces", name))

type OutcomeRow = {
  addressHash: string | null
  outcome: string
  organizationId: string | null
  volunteerId: string | null
  kind: string
  createdAt: Date
}

const matchingOutcome = (over: Partial<OutcomeRow> = {}): OutcomeRow => ({
  addressHash: addressHash(RECIPIENT, SECRET),
  outcome: "accepted_by_relay",
  organizationId: ORG,
  volunteerId: VOLUNTEER,
  kind: "registration_confirmation",
  createdAt: new Date("2026-11-18T08:00:00Z"),
  ...over,
})

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() }))
const db = {
  notificationOutbox: { findUnique: mocks.findUnique },
  deliveryOutcome: { findMany: mocks.findMany, create: mocks.create },
} as unknown as PrismaClient

const analyze = async (name: string) => analyzeBounceDsn(await parseBounceDsn(fixture(name)), { host: HOST, secret: SECRET, db })

describe("analyzeBounceDsn", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset()
    mocks.findUnique.mockResolvedValue({ id: OUTBOX, organizationId: ORG })
    mocks.findMany.mockResolvedValue([matchingOutcome()])
    mocks.create.mockResolvedValue({})
  })

  it("records a permanent refusal as rejected_permanent, from the matched outbox row's organisation", async () => {
    expect(await analyze("gandi-550-5.4.1-m365.eml")).toBe("flagged")
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        volunteerId: VOLUNTEER,
        outboxId: OUTBOX,
        kind: "registration_confirmation",
        outcome: "rejected_permanent",
        reason: "bounced_after_acceptance",
        responseCode: 550,
        enhancedStatus: "5.4.1",
        addressHash: addressHash(RECIPIENT, SECRET),
      },
    })
  })

  it("is idempotent per (outbox row, address): an existing permanent outcome writes nothing", async () => {
    mocks.findMany.mockResolvedValue([matchingOutcome({ outcome: "rejected_permanent" })])
    expect(await analyze("gandi-550-5.4.1-m365.eml")).toBe("already_known")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("ignores a delayed / 4.x.x notice and never writes", async () => {
    mocks.findMany.mockResolvedValue([matchingOutcome({ addressHash: addressHash("retard@exemple.org", SECRET) })])
    expect(await analyze("gandi-4.4.1-delayed.eml")).toBe("ignored_temporary")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("never correlates a forged Message-ID", async () => {
    expect(await analyze("forged-dsn-other-message-id.eml")).toBe("uncorrelated")
    expect(mocks.findMany).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("never correlates a recipient whose hash is not among the outbox outcomes", async () => {
    expect(await analyze("dsn-recipient-hash-mismatch.eml")).toBe("uncorrelated")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("never writes for another organisation: only the matched outbox row's outcomes count", async () => {
    mocks.findMany.mockResolvedValue([
      matchingOutcome({ organizationId: "org-b", addressHash: addressHash("someone-else@exemple.org", SECRET) }),
    ])
    expect(await analyze("gandi-550-5.4.1-m365.eml")).toBe("uncorrelated")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("skips an auto-reply or a read receipt without calling them uncorrelated", async () => {
    expect(await analyze("out-of-office.eml")).toBe("ignored")
    expect(await analyze("read-receipt.eml")).toBe("ignored")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("accepts a non-standard bounce only through its attached original headers", async () => {
    mocks.findUnique.mockResolvedValue({ id: "clx0000000000000000000002", organizationId: ORG })
    mocks.findMany.mockResolvedValue([
      matchingOutcome({ addressHash: addressHash("inconnu@exemple.org", SECRET) }),
    ])
    expect(await analyze("non-standard-bounce.eml")).toBe("flagged")
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG }) }))
  })

  it("uses the matched outcome's organisation when the outbox row was already purged", async () => {
    mocks.findUnique.mockResolvedValue(null)
    expect(await analyze("gandi-550-5.4.1-m365.eml")).toBe("flagged")
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG }) }))
  })

  it("feeds the same « Adresse à vérifier » derivation as an immediate refusal", async () => {
    await analyze("gandi-550-5.4.1-m365.eml")
    const created = mocks.create.mock.calls[0][0].data as { addressHash: string; outcome: string; createdAt?: Date }
    const status = addressStatus(
      addressHash(RECIPIENT, SECRET),
      [{ addressHash: created.addressHash, outcome: created.outcome, createdAt: new Date("2026-11-18T09:16:00Z") }],
      new Date("2026-11-18T10:00:00Z"),
    )
    expect(status.kind).toBe("to_verify")
  })
})

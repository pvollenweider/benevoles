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
import { parseBounceDsn, type ParsedBounce } from "../bounce-dsn"
import { analyzeBounceDsn, LEGACY_DIRECT_BOUNCES_UNTIL } from "../bounce-mailbox"
import { addressHash } from "../notifications/smtp-outcome"

// Deferred bounces (#602): correlation, idempotency and the outcome created. The DSN fixtures are
// anonymised Gandi/Postfix and Microsoft 365 samples; nothing here opens a mailbox.

const HOST = "www.benevol.app"
const SECRET = "test-secret-at-least-32-characters-long"
const ORG = "org-a"
const VOLUNTEER = "vol-1"
const OUTBOX = "clx0000000000000000000001"
const RECIPIENT = "eleve.test@ecole-exemple.org"
const DIRECT_REF = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"
const DIRECT_RECIPIENT = "membre.inconnu@example.org"
// A date before LEGACY_DIRECT_BOUNCES_UNTIL, so the bounded path is still open.
const LEGACY_NOW = new Date("2026-12-01T10:00:00Z")
const LEGACY_ROW_TIME = new Date("2026-11-15T08:00:00Z")

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

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() }))
const db = {
  notificationOutbox: { findUnique: mocks.findUnique },
  deliveryOutcome: { findMany: mocks.findMany, findFirst: mocks.findFirst, create: mocks.create },
} as unknown as PrismaClient

const analyze = async (name: string) => analyzeBounceDsn(await parseBounceDsn(fixture(name)), { host: HOST, secret: SECRET, db })

/** A parsed direct-send DSN; the real-shaped Outlook fixture covers the parsing side. */
const directParsed = (over: Partial<ParsedBounce> = {}): ParsedBounce => ({
  isDsn: true,
  reportType: "delivery-status",
  originalMessageId: `<direct-${DIRECT_REF}@${HOST}>`,
  recipients: [
    { finalRecipient: DIRECT_RECIPIENT, action: "failed", status: "5.5.0", diagnosticCode: "smtp;550 5.5.0 Requested action not taken: mailbox unavailable." },
  ],
  ...over,
})
const analyzeDirect = (over: Partial<ParsedBounce> = {}) => analyzeBounceDsn(directParsed(over), { host: HOST, secret: SECRET, db })

/** A DSN whose original Message-ID is not one of this deployment's two forms (a pre-fix send). */
const legacyParsed = (over: Partial<ParsedBounce> = {}): ParsedBounce =>
  directParsed({ originalMessageId: "<20261118090000.legacy@other.example.org>", ...over })
const analyzeLegacy = (over: Partial<ParsedBounce> = {}, now: Date = LEGACY_NOW) =>
  analyzeBounceDsn(legacyParsed(over), { host: HOST, secret: SECRET, db, now })

/** A pre-fix direct send: no outboxId, no messageRef, accepted by the relay, with a member. */
const legacyRow = (over: Partial<OutcomeRow> = {}): OutcomeRow => ({
  addressHash: addressHash(DIRECT_RECIPIENT, SECRET),
  outcome: "accepted_by_relay",
  organizationId: ORG,
  volunteerId: VOLUNTEER,
  kind: "reminder_j1",
  createdAt: LEGACY_ROW_TIME,
  ...over,
})

describe("analyzeBounceDsn", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset()
    mocks.findUnique.mockResolvedValue({ id: OUTBOX, organizationId: ORG })
    mocks.findMany.mockResolvedValue([matchingOutcome()])
    // No pre-fix direct row by default: the legacy path stays uncorrelated unless a test opts in.
    mocks.findFirst.mockResolvedValue(null)
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

  // A nullable filter here would read every legacy row: `{ messageRef: null }` matches them all.
  it("never queries DeliveryOutcome rows with a null or missing messageRef filter", async () => {
    // Neither an outbox id nor a direct reference: no key at all, so no query either.
    mocks.findMany.mockResolvedValue([])
    expect(await analyzeDirect({ originalMessageId: "<random-nodemailer-id@example.org>" })).toBe("uncorrelated")
    expect(mocks.findMany).not.toHaveBeenCalled()

    // A valid direct reference always filters on a non-empty string.
    expect(await analyzeDirect()).toBe("uncorrelated")
    expect(mocks.findMany).toHaveBeenCalledOnce()
    const where = mocks.findMany.mock.calls[0][0].where as Record<string, unknown>
    expect(where).toHaveProperty("messageRef")
    expect(typeof where.messageRef).toBe("string")
    expect((where.messageRef as string).length).toBeGreaterThan(0)
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

  // a direct send is matched by the random reference of its Message-ID, and its own
  // DeliveryOutcome rows alone say which organisation, member and kind the bounce belongs to.
  it("flags a direct bounce once, carrying the matched row's organisation, member and kind", async () => {
    mocks.findMany.mockResolvedValue([
      matchingOutcome({ addressHash: addressHash(DIRECT_RECIPIENT, SECRET), kind: "reminder_j1" }),
    ])
    expect(await analyze("outlook-550-5.5.0-direct.eml")).toBe("flagged")

    // No NotificationOutbox row exists for a direct send: only its outcomes are read.
    expect(mocks.findUnique).not.toHaveBeenCalled()
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { messageRef: DIRECT_REF } }))
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        volunteerId: VOLUNTEER,
        outboxId: null,
        messageRef: DIRECT_REF,
        kind: "reminder_j1",
        outcome: "rejected_permanent",
        reason: "bounced_after_acceptance",
        responseCode: 550,
        enhancedStatus: "5.5.0",
        addressHash: addressHash(DIRECT_RECIPIENT, SECRET),
      },
    })
  })

  it("is idempotent per (direct reference, address): a second notice is already known", async () => {
    mocks.findMany.mockResolvedValue([
      matchingOutcome({ addressHash: addressHash(DIRECT_RECIPIENT, SECRET), outcome: "rejected_permanent" }),
    ])
    expect(await analyzeDirect()).toBe("already_known")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("ignores a direct temporary status and never writes", async () => {
    mocks.findMany.mockResolvedValue([matchingOutcome({ addressHash: addressHash(DIRECT_RECIPIENT, SECRET) })])
    const temporary = directParsed({
      recipients: [{ finalRecipient: DIRECT_RECIPIENT, action: "delayed", status: "4.4.1", diagnosticCode: "smtp;450 4.4.1 Try later" }],
    })
    expect(await analyzeBounceDsn(temporary, { host: HOST, secret: SECRET, db })).toBe("ignored_temporary")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("never correlates a direct reference with no outcome row", async () => {
    mocks.findMany.mockResolvedValue([])
    expect(await analyzeDirect({ originalMessageId: `<direct-${"f".repeat(40)}@${HOST}>` })).toBe("uncorrelated")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("never correlates a direct reference for another host", async () => {
    expect(await analyzeDirect({ originalMessageId: `<direct-${DIRECT_REF}@other.example.org>` })).toBe("uncorrelated")
    expect(mocks.findMany).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("never correlates a direct reference whose recipient hash is not among its rows", async () => {
    mocks.findMany.mockResolvedValue([matchingOutcome({ addressHash: addressHash(RECIPIENT, SECRET) })])
    expect(await analyzeDirect()).toBe("uncorrelated")
    expect(mocks.create).not.toHaveBeenCalled()
  })

  // Legacy direct sends (before the <direct-…> fix) have a random Message-ID: the bounded
  // exception below is the only link left, through the most recent pre-fix accepted row.
  it("flags a legacy direct bounce from the most recent pre-fix row, with its organisation, member and kind", async () => {
    mocks.findFirst.mockResolvedValueOnce(legacyRow()).mockResolvedValueOnce(null)
    expect(await analyzeLegacy()).toBe("flagged")

    expect(mocks.findFirst.mock.calls[0][0]).toEqual({
      where: {
        addressHash: addressHash(DIRECT_RECIPIENT, SECRET),
        outboxId: null,
        messageRef: null,
        outcome: "accepted_by_relay",
        volunteerId: { not: null },
        // The retention window, counted from the injected current time.
        createdAt: { gte: new Date("2026-11-01T10:00:00Z") },
      },
      orderBy: { createdAt: "desc" },
      select: { organizationId: true, volunteerId: true, kind: true, createdAt: true },
    })
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        volunteerId: VOLUNTEER,
        outboxId: null,
        messageRef: null,
        kind: "reminder_j1",
        outcome: "rejected_permanent",
        reason: "bounced_after_acceptance",
        responseCode: 550,
        enhancedStatus: "5.5.0",
        addressHash: addressHash(DIRECT_RECIPIENT, SECRET),
      },
    })
  })

  it("applies the legacy path to a random Message-ID on our own host too", async () => {
    mocks.findFirst.mockResolvedValueOnce(legacyRow()).mockResolvedValueOnce(null)
    expect(await analyzeLegacy({ originalMessageId: `<20261118090000.random@${HOST}>` })).toBe("flagged")
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it("treats a second legacy notice for the same accepted row as already known", async () => {
    mocks.findFirst.mockResolvedValueOnce(legacyRow()).mockResolvedValueOnce({ id: "outcome-existing" })
    expect(await analyzeLegacy()).toBe("already_known")
    // The idempotency lookup is the pre-fix bounce for this address, after the accepted row.
    expect(mocks.findFirst.mock.calls[1][0]).toEqual({
      where: {
        addressHash: addressHash(DIRECT_RECIPIENT, SECRET),
        outboxId: null,
        messageRef: null,
        outcome: "rejected_permanent",
        reason: "bounced_after_acceptance",
        createdAt: { gt: LEGACY_ROW_TIME },
      },
      select: { id: true },
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("uses the most recent row when the same address has pre-fix rows in two organisations", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(legacyRow({ organizationId: "org-recent", kind: "manual_reminder", createdAt: new Date("2026-11-20T08:00:00Z") }))
      .mockResolvedValueOnce(null)
    expect(await analyzeLegacy()).toBe("flagged")
    expect(mocks.findFirst.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-recent", kind: "manual_reminder" }) }),
    )
  })

  it("never uses a row with an outboxId or a messageRef, another outcome, or no member", async () => {
    mocks.findFirst.mockResolvedValue(null)
    expect(await analyzeLegacy()).toBe("uncorrelated")
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({
      addressHash: addressHash(DIRECT_RECIPIENT, SECRET),
      outboxId: null,
      messageRef: null,
      outcome: "accepted_by_relay",
      volunteerId: { not: null },
      createdAt: { gte: new Date("2026-11-01T10:00:00Z") },
    })
  })

  it("writes nothing for a legacy temporary status, and never looks a row up", async () => {
    const temporary = legacyParsed({
      recipients: [{ finalRecipient: DIRECT_RECIPIENT, action: "delayed", status: "4.4.1", diagnosticCode: "smtp;450 4.4.1 Try later" }],
    })
    expect(await analyzeBounceDsn(temporary, { host: HOST, secret: SECRET, db, now: LEGACY_NOW })).toBe("uncorrelated")
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("stops the legacy path after LEGACY_DIRECT_BOUNCES_UNTIL, without any query", async () => {
    const after = new Date(LEGACY_DIRECT_BOUNCES_UNTIL.getTime() + 1)
    expect(await analyzeLegacy({}, after)).toBe("uncorrelated")
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("never falls through to the legacy path for an outbox id of this host with no rows", async () => {
    mocks.findUnique.mockResolvedValue(null)
    mocks.findMany.mockResolvedValue([])
    expect(await analyzeDirect({ originalMessageId: `<outbox-${OUTBOX}@${HOST}>` })).toBe("uncorrelated")
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("never falls through to the legacy path for a direct reference of this host with no rows", async () => {
    mocks.findMany.mockResolvedValue([])
    expect(await analyzeDirect()).toBe("uncorrelated")
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("leaves a notice without an original Message-ID uncorrelated, without any query", async () => {
    expect(await analyzeDirect({ originalMessageId: null })).toBe("uncorrelated")
    expect(mocks.findMany).not.toHaveBeenCalled()
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})

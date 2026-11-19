// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-characters-long" } }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => undefined }))

import { MAX_BOUNCES_PER_RUN, scanBounceMailbox, uidsToScan, type BounceImapClient, type BounceVerdict } from "../bounce-mailbox"
import type { BounceMailboxConfig } from "../bounce-mailbox-config"

const config: BounceMailboxConfig = {
  host: "mail.gandi.net",
  port: 993,
  user: "notifications@benevol.app",
  password: "secret",
  processedFolder: "Rejets traités",
}

function client(over: Partial<BounceImapClient> = {}): BounceImapClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([{ path: "INBOX" }]),
    mailboxCreate: vi.fn().mockResolvedValue({}),
    getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
    search: vi.fn().mockResolvedValue([]),
    fetchOne: vi.fn().mockResolvedValue(false),
    messageMove: vi.fn().mockResolvedValue({}),
    logout: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe("uidsToScan", () => {
  it("sorts, deduplicates and bounds the search answer", () => {
    expect(uidsToScan([3, 1, 2, 1])).toEqual([1, 2, 3])
    expect(uidsToScan(false)).toEqual([])
    expect(uidsToScan(undefined)).toEqual([])
    expect(uidsToScan(Array.from({ length: 250 }, (_, i) => 250 - i))).toEqual(
      Array.from({ length: MAX_BOUNCES_PER_RUN }, (_, i) => i + 1),
    )
    expect(MAX_BOUNCES_PER_RUN).toBe(200)
  })
})

describe("scanBounceMailbox", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates the processed folder when missing, fetches each candidate, and moves every processed DSN", async () => {
    const imap = client({
      search: vi.fn().mockResolvedValue([3, 1, 2]),
      fetchOne: vi.fn(async (sequence: string) => ({ source: Buffer.from(sequence) })),
    })
    const verdicts: Record<string, BounceVerdict> = { "1": "flagged", "2": "already_known", "3": "uncorrelated" }
    const analyze = vi.fn(async (raw: Buffer) => verdicts[raw.toString()])

    const result = await scanBounceMailbox(config, { createClient: () => imap, analyze })

    expect(imap.connect).toHaveBeenCalledOnce()
    expect(imap.mailboxCreate).toHaveBeenCalledWith("Rejets traités")
    expect(imap.getMailboxLock).toHaveBeenCalledWith("INBOX")
    expect(imap.search).toHaveBeenCalledOnce()
    expect(imap.fetchOne).toHaveBeenCalledTimes(3)
    expect(imap.messageMove).toHaveBeenCalledTimes(2)
    expect(imap.messageMove).toHaveBeenNthCalledWith(1, [1], "Rejets traités", { uid: true })
    expect(imap.messageMove).toHaveBeenNthCalledWith(2, [2], "Rejets traités", { uid: true })
    expect(imap.logout).toHaveBeenCalledOnce()
    expect(result).toEqual({
      scanned: 3,
      flagged: 1,
      alreadyKnown: 1,
      ignoredTemporary: 0,
      ignored: 0,
      uncorrelated: 1,
      errors: 0,
      processedFolder: "Rejets traités",
    })
  })

  it("does not create a folder that already exists", async () => {
    const imap = client({ list: vi.fn().mockResolvedValue([{ path: "INBOX" }, { path: "Rejets traités" }]) })
    const result = await scanBounceMailbox(config, { createClient: () => imap, analyze: async () => "uncorrelated" })
    expect(imap.mailboxCreate).not.toHaveBeenCalled()
    expect(result.scanned).toBe(0)
  })

  it("leaves uncorrelated messages, auto-replies and read receipts in INBOX, counted apart", async () => {
    const imap = client({
      search: vi.fn().mockResolvedValue([7, 8]),
      fetchOne: vi.fn(async (sequence: string) => ({ source: Buffer.from(sequence) })),
    })
    const verdicts: Record<string, BounceVerdict> = { "7": "uncorrelated", "8": "ignored" }
    const result = await scanBounceMailbox(config, {
      createClient: () => imap,
      analyze: async (raw: Buffer) => verdicts[raw.toString()],
    })
    expect(result).toMatchObject({ uncorrelated: 1, ignored: 1 })
    expect(imap.messageMove).not.toHaveBeenCalled()
  })

  it("moves a temporary DSN that belongs to us, and counts it apart", async () => {
    const imap = client({ search: vi.fn().mockResolvedValue([4]), fetchOne: vi.fn().mockResolvedValue({ source: Buffer.from("4") }) })
    const result = await scanBounceMailbox(config, { createClient: () => imap, analyze: async () => "ignored_temporary" })
    expect(result.ignoredTemporary).toBe(1)
    expect(imap.messageMove).toHaveBeenCalledWith([4], "Rejets traités", { uid: true })
  })

  it("counts a fetch, analysis or move failure without losing the other messages", async () => {
    const imap = client({
      search: vi.fn().mockResolvedValue([1, 2, 3]),
      fetchOne: vi
        .fn()
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockResolvedValueOnce({ source: Buffer.from("2") })
        .mockResolvedValueOnce({ source: Buffer.from("3") }),
      messageMove: vi.fn().mockRejectedValueOnce(new Error("move failed")),
    })
    const analyze = vi.fn(async (raw: Buffer) => {
      if (raw.toString() === "2") throw new Error("parse failed")
      return "flagged" as BounceVerdict
    })

    const result = await scanBounceMailbox(config, { createClient: () => imap, analyze })
    expect(result).toMatchObject({ scanned: 3, flagged: 1, errors: 3 })
    expect(imap.messageMove).toHaveBeenCalledOnce()
    expect(imap.logout).toHaveBeenCalledOnce()
  })

  it("counts a move the server refuses, leaving the DSN for the next run", async () => {
    const imap = client({
      search: vi.fn().mockResolvedValue([5]),
      fetchOne: vi.fn().mockResolvedValue({ source: Buffer.from("5") }),
      messageMove: vi.fn().mockResolvedValue(false),
    })
    const result = await scanBounceMailbox(config, { createClient: () => imap, analyze: async () => "flagged" })
    expect(result).toMatchObject({ scanned: 1, flagged: 1, errors: 1 })
  })

  it("counts a search the server refuses as an error", async () => {
    const imap = client({ search: vi.fn().mockResolvedValue(false) })
    const result = await scanBounceMailbox(config, { createClient: () => imap, analyze: async () => "uncorrelated" })
    expect(result).toMatchObject({ scanned: 0, errors: 1 })
  })

  it("releases the mailbox lock and logs out when the search fails", async () => {
    const release = vi.fn()
    const imap = client({
      getMailboxLock: vi.fn().mockResolvedValue({ release }),
      search: vi.fn().mockRejectedValue(new Error("IMAP down")),
    })
    await expect(scanBounceMailbox(config, { createClient: () => imap, analyze: async () => "uncorrelated" })).rejects.toThrow("IMAP down")
    expect(release).toHaveBeenCalledOnce()
    expect(imap.logout).toHaveBeenCalledOnce()
  })

  it("refuses to run without a classifier", async () => {
    await expect(scanBounceMailbox(config, { createClient: () => client() })).rejects.toThrow("requires an analyze function")
  })
})

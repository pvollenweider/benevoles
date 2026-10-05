// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { erasureEmailHash, parseRegisterLines, registerLine, replayDecision, type ErasureRegisterLine } from "../member-erasure-register"

const SECRET = "s".repeat(32)

describe("erasureEmailHash (#516)", () => {
  it("is stable for the same normalized address, and never contains it", () => {
    const a = erasureEmailHash("org-1", " Julie@Example.com ", SECRET)
    expect(a).toBe(erasureEmailHash("org-1", "julie@example.com", SECRET))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toContain("julie")
  })

  it("differs between organisations and between secrets (no correlation across tenants or with a dump alone)", () => {
    const a = erasureEmailHash("org-1", "julie@example.com", SECRET)
    expect(erasureEmailHash("org-2", "julie@example.com", SECRET)).not.toBe(a)
    expect(erasureEmailHash("org-1", "julie@example.com", "t".repeat(32))).not.toBe(a)
  })
})

describe("register lines (#516)", () => {
  const entry = { organizationId: "org-1", volunteerId: "vol-1", emailHash: "a".repeat(64), erasedAt: new Date("2026-10-05T10:00:00Z") }

  it("round-trips through the export format", () => {
    const { lines, rejected } = parseRegisterLines(registerLine(entry))
    expect(rejected).toBe(0)
    expect(lines).toEqual([{ organizationId: "org-1", volunteerId: "vol-1", emailHash: "a".repeat(64), erasedAt: "2026-10-05T10:00:00.000Z" }])
  })

  it("reads raw application logs: prefixes ignored, other log lines skipped, malformed ones counted", () => {
    const text = [
      "2026-10-05T10:00:01Z stdout F " + registerLine(entry),
      "2026-10-05T10:00:02Z stdout F [cron] cleanup done",
      '{"event":"member.erased","organizationId":"org-1"}',
      "{not json member.erased",
      registerLine({ ...entry, volunteerId: "vol-2", emailHash: null }),
    ].join("\n")
    const { lines, rejected } = parseRegisterLines(text)
    expect(lines.map((l) => l.volunteerId)).toEqual(["vol-1", "vol-2"])
    expect(rejected).toBe(2)
  })

  it("collapses duplicates of the same member to the earliest erasure", () => {
    const text = [registerLine({ ...entry, erasedAt: new Date("2026-10-06T00:00:00Z") }), registerLine(entry)].join("\n")
    expect(parseRegisterLines(text).lines).toHaveLength(1)
    expect(parseRegisterLines(text).lines[0].erasedAt).toBe("2026-10-05T10:00:00.000Z")
  })

  it("rejects a line whose hash isn't a hash (never accepts an address in clear)", () => {
    const bad = JSON.stringify({ event: "member.erased", organizationId: "org-1", volunteerId: "v", emailHash: "julie@example.com", erasedAt: "2026-10-05T10:00:00Z" })
    expect(parseRegisterLines(bad)).toEqual({ lines: [], rejected: 1 })
  })
})

describe("replayDecision (#516)", () => {
  const line: ErasureRegisterLine = { organizationId: "org-1", volunteerId: "vol-1", emailHash: "h".repeat(64), erasedAt: "2026-10-05T10:00:00.000Z" }
  const before = new Date("2026-09-01T00:00:00Z")
  const after = new Date("2026-10-06T00:00:00Z")

  it("erases the restored record by id", () => {
    expect(replayDecision(line, { id: "vol-1", erasedAt: null }, [])).toEqual([{ kind: "erase", volunteerId: "vol-1", matchedBy: "id" }])
  })

  it("does nothing on a record already erased", () => {
    expect(replayDecision(line, { id: "vol-1", erasedAt: new Date() }, [])).toEqual([{ kind: "already_erased", volunteerId: "vol-1" }])
  })

  it("falls back to the address hash only for records created before the erasure", () => {
    const candidates = [
      { id: "old", createdAt: before, erasedAt: null, emailHash: line.emailHash },
      { id: "signed-up-again", createdAt: after, erasedAt: null, emailHash: line.emailHash },
      { id: "someone-else", createdAt: before, erasedAt: null, emailHash: "x".repeat(64) },
    ]
    expect(replayDecision(line, null, candidates)).toEqual([{ kind: "erase", volunteerId: "old", matchedBy: "email_hash" }])
  })

  it("reports not found when neither the id nor the hash matches, or when there was no address", () => {
    expect(replayDecision(line, null, [])).toEqual([{ kind: "not_found" }])
    expect(replayDecision({ ...line, emailHash: null }, null, [{ id: "old", createdAt: before, erasedAt: null, emailHash: null }])).toEqual([{ kind: "not_found" }])
  })
})

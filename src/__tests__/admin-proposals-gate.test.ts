// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Generated proposals (#1172): every new route sits behind the beta capability « assignmentProposals »
 * (not shipped yet, so nobody can adopt it) unless the event already has a run (BE06), and needs an
 * event that uses dated availability. A refusal reads and writes nothing else.
 */

const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: vi.fn(async () => guard.value) }))
const beta = vi.hoisted(() => ({ open: false }))
vi.mock("@/lib/beta-access", () => ({ canAdoptBeta: vi.fn(async () => beta.open) }))
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), rateLimit: vi.fn(async () => ({ ok: true, remaining: 1, retryAfter: 0 })) }))
// The draft and erasure modules reach @/lib/env and @/lib/prisma transitively: never used here.
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: () => { throw new Error("raw client used") } }) }))
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))

import { BETA_CAPABILITIES } from "@/lib/beta-capabilities"

function scopedDb(event: Record<string, unknown> | null, runs = 0) {
  const touched = vi.fn()
  const delegate = (name: string) => new Proxy({}, { get: (_t, op) => (...args: unknown[]) => { touched(name, op, args); return Promise.resolve(op === "count" ? runs : op === "findMany" ? [] : null) } })
  const db = {
    event: { findFirst: vi.fn().mockResolvedValue(event) },
    proposalRun: { count: vi.fn().mockResolvedValue(runs), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), updateMany: vi.fn() },
    eventVolunteerTarget: delegate("eventVolunteerTarget"),
    draftAssignment: delegate("draftAssignment"),
    $transaction: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }
  guard.value = { db, organizationId: "org-a", session: { user: { id: "adm-a", role: "owner", organizationId: "org-a" } } }
  return { db, touched }
}

const config = { scope: { shiftIds: ["s1"], volunteerIds: ["v1"] }, rotation: { maxConsecutiveDays: 2, maxNightAddOns: 2 }, seed: 1 }
const req = (method: string, body?: unknown) => new Request("http://localhost/api", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
const p = { params: Promise.resolve({ id: "evt-a", runId: "run-a", draftId: "d-a" }) }

async function everyRoute() {
  const list = await import("@/app/api/admin/events/[id]/proposals/route")
  const one = await import("@/app/api/admin/events/[id]/proposals/[runId]/route")
  const cancel = await import("@/app/api/admin/events/[id]/proposals/[runId]/cancel/route")
  const write = await import("@/app/api/admin/events/[id]/proposals/[runId]/write/route")
  const targets = await import("@/app/api/admin/events/[id]/proposal-targets/route")
  const lock = await import("@/app/api/admin/events/[id]/drafts/[draftId]/lock/route")
  return [
    ["GET proposals", () => list.GET(req("GET"), p)],
    ["POST proposals", () => list.POST(req("POST", { idempotencyKey: "key-12345678", configuration: config }), p)],
    ["GET proposals/[runId]", () => one.GET(req("GET"), p)],
    ["POST cancel", () => cancel.POST(req("POST"), p)],
    ["POST write", () => write.POST(req("POST"), p)],
    ["GET proposal-targets", () => targets.GET(req("GET"), p)],
    ["PUT proposal-targets", () => targets.PUT(req("PUT", { targets: [{ volunteerId: "v1", targetMinutes: 60 }] }), p)],
    ["POST drafts/[draftId]/lock", () => lock.POST(req("POST", { revision: 1, locked: true }), p)],
  ] as const
}

describe("proposal routes behind the beta capability (#1172)", () => {
  beforeEach(() => { vi.clearAllMocks(); beta.open = false })

  it("is declared and not shipped yet", () => {
    expect(BETA_CAPABILITIES.assignmentProposals.shipped).toBe(false)
  })

  it("every route refuses with 403 while the organisation cannot adopt it, touching nothing", async () => {
    for (const [name, call] of await everyRoute()) {
      const { db, touched } = scopedDb({ id: "evt-a", availabilityEnabled: true, availabilityAdoptedAt: null })
      const res = await call()
      expect(res.status, name).toBe(403)
      expect((await res.json()).error, name).toMatch(/pas ouverte/)
      expect(touched, name).not.toHaveBeenCalled()
      expect(db.proposalRun.create, name).not.toHaveBeenCalled()
      expect(db.$transaction, name).not.toHaveBeenCalled()
    }
  })

  it("every route refuses an event that does not use dated availability", async () => {
    beta.open = true
    for (const [name, call] of await everyRoute()) {
      scopedDb({ id: "evt-a", availabilityEnabled: false, availabilityAdoptedAt: null })
      expect((await call()).status, name).toBe(409)
    }
  })

  it("an event that already has a run keeps its routes after the beta closes (BE06)", async () => {
    const list = await import("@/app/api/admin/events/[id]/proposals/route")
    scopedDb({ id: "evt-a", availabilityEnabled: true, availabilityAdoptedAt: null }, 1)
    expect((await list.GET(req("GET"), p)).status).toBe(200)
  })
})

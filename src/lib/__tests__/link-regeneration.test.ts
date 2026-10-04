import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "../token-hash"

// #542: bulk invalidation of volunteer-facing links after a leak. generateToken is mocked to a
// predictable, strictly increasing sequence so we can assert every row gets a distinct new token
// and that the resulting hash differs from the row's original hash (the old link must stop
// resolving: `registrationToken.where(oldToken)` / `linkToken.where(oldToken)` would no longer
// match the row). token-vault itself is NOT mocked: sealing runs for real (no
// TOKEN_ENCRYPTION_KEY in the test env, so tokens land in the legacy column — irrelevant here).

const tokenMock = vi.hoisted(() => ({ n: 0 }))
vi.mock("../utils", () => ({ generateToken: () => `new-token-${++tokenMock.n}` }))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("../notifications", () => ({ sendNotification: sendNotificationMock }))

const sendMemberInviteMock = vi.hoisted(() => vi.fn())
vi.mock("../notification-helpers", () => ({ sendMemberInvite: sendMemberInviteMock }))

import { countLinksInScope, regenerateLinks, type LinkRegenerationDb } from "../link-regeneration"
import { registrationToken, linkToken } from "../token-vault"

beforeEach(() => {
  tokenMock.n = 0
  sendNotificationMock.mockReset().mockResolvedValue({ ok: true })
  sendMemberInviteMock.mockReset().mockResolvedValue({ ok: true })
})

const orgA = "org-a"
const orgB = "org-b"

function regRow(overrides: Partial<{
  id: string; volunteerId: string; eventId: string; status: string
  editTokenHash: string; volunteer: { firstName: string; lastName: string; email: string | null }
  event: { title: string; organization: { slug: string } }
}> = {}) {
  return {
    id: "reg-1",
    volunteerId: "vol-1",
    eventId: "evt-1",
    status: "active",
    editTokenHash: hashToken("old-reg-token"),
    volunteer: { firstName: "Alice", lastName: "A", email: "alice@x.ch" },
    event: { title: "Fête", organization: { slug: "orga" } },
    ...overrides,
  }
}

function leaderRow(overrides: Partial<{ id: string; roleName: string; name: string; email: string; tokenHash: string; event: { title: string; organization: { slug: string } } }> = {}) {
  return {
    id: "ldr-1",
    roleName: "Buvette",
    name: "Bob",
    email: "bob@x.ch",
    tokenHash: hashToken("old-leader-token"),
    event: { title: "Fête", organization: { slug: "orga" } },
    ...overrides,
  }
}

function inviteRow(overrides: Partial<{
  id: string; tokenHash: string
  volunteer: { firstName: string; email: string | null; active: boolean }
  event: { title: string; slug: string; startDate: Date; location: string | null; organization: { name: string; slug: string } }
}> = {}) {
  return {
    id: "inv-1",
    tokenHash: hashToken("old-invite-token"),
    volunteer: { firstName: "Cathy", email: "cathy@x.ch", active: true },
    event: { title: "Fête", slug: "fete", startDate: new Date("2026-06-01"), location: "Lausanne", organization: { name: "Orga", slug: "orga" } },
    ...overrides,
  }
}

/** Builds a fake db that records every findMany `where` and every update's `data`. */
function fakeDb(rows: { registrations?: ReturnType<typeof regRow>[]; leaders?: ReturnType<typeof leaderRow>[]; invites?: ReturnType<typeof inviteRow>[] }) {
  const calls = {
    registrationWhere: [] as unknown[],
    leaderWhere: [] as unknown[],
    inviteWhere: [] as unknown[],
    registrationUpdates: [] as { id: string; data: Record<string, unknown> }[],
    leaderUpdates: [] as { id: string; data: Record<string, unknown> }[],
    inviteUpdates: [] as { id: string; data: Record<string, unknown> }[],
    registrationUpdateMany: [] as unknown[],
  }
  const db: LinkRegenerationDb = {
    registration: {
      findMany: vi.fn(async ({ where }) => { calls.registrationWhere.push(where); return rows.registrations ?? [] }),
      update: vi.fn(async ({ where, data }) => { calls.registrationUpdates.push({ id: where.id, data }); return {} }),
      updateMany: vi.fn(async (args) => { calls.registrationUpdateMany.push(args); return { count: 0 } }),
    },
    sectorLeader: {
      findMany: vi.fn(async ({ where }) => { calls.leaderWhere.push(where); return rows.leaders ?? [] }),
      update: vi.fn(async ({ where, data }) => { calls.leaderUpdates.push({ id: where.id, data }); return {} }),
    },
    memberInvite: {
      findMany: vi.fn(async ({ where }) => { calls.inviteWhere.push(where); return rows.invites ?? [] }),
      update: vi.fn(async ({ where, data }) => { calls.inviteUpdates.push({ id: where.id, data }); return {} }),
    },
    $transaction: (async (fn) => fn(db)) as LinkRegenerationDb["$transaction"],
  }
  return { db, calls }
}

describe("regenerateLinks — scope selection", () => {
  it("organization scope filters every model by event.organizationId (cross-tenant)", async () => {
    const { db, calls } = fakeDb({ registrations: [regRow()], leaders: [leaderRow()], invites: [inviteRow()] })
    await regenerateLinks(db, { organizationId: orgA })
    expect(calls.registrationWhere).toEqual([{ event: { organizationId: orgA } }])
    expect(calls.leaderWhere).toEqual([{ event: { organizationId: orgA } }])
    expect(calls.inviteWhere).toEqual([{ event: { organizationId: orgA } }])
    // Never queried with orgB — the where clause is org-A-only, so org-B rows are never in scope.
    expect(JSON.stringify(calls.registrationWhere)).not.toContain(orgB)
  })

  it("event scope filters by eventId", async () => {
    const { db, calls } = fakeDb({ registrations: [regRow()] })
    await regenerateLinks(db, { eventId: "evt-1" })
    expect(calls.registrationWhere).toEqual([{ eventId: "evt-1" }])
    expect(calls.leaderWhere).toEqual([{ eventId: "evt-1" }])
    expect(calls.inviteWhere).toEqual([{ eventId: "evt-1" }])
  })

  it("row-list scope only queries the models given ids for", async () => {
    const { db, calls } = fakeDb({ registrations: [regRow({ id: "reg-9" })] })
    const result = await regenerateLinks(db, { registrationIds: ["reg-9"] })
    expect(calls.registrationWhere).toEqual([{ id: { in: ["reg-9"] } }])
    expect(calls.leaderWhere).toEqual([])
    expect(calls.inviteWhere).toEqual([])
    expect(result.counts).toEqual({ registrations: 1, leaders: 0, invites: 0 })
  })
})

describe("regenerateLinks — token rotation", () => {
  it("replaces every targeted row's token with a fresh, distinct, unique one; the old hash no longer matches", async () => {
    const oldRegToken = "old-reg-token"
    const oldLeaderToken = "old-leader-token"
    const reg = regRow({ editTokenHash: hashToken(oldRegToken) })
    const leader = leaderRow({ tokenHash: hashToken(oldLeaderToken) })
    const { db, calls } = fakeDb({ registrations: [reg], leaders: [leader] })

    await regenerateLinks(db, { eventId: "evt-1" })

    const regUpdate = calls.registrationUpdates[0]
    const leaderUpdate = calls.leaderUpdates[0]
    expect(regUpdate.id).toBe(reg.id)
    expect(leaderUpdate.id).toBe(leader.id)

    // New hash differs from the old one: registrationToken.where(oldToken) / linkToken.where(oldToken)
    // would no longer match this row.
    expect(regUpdate.data.editTokenHash).not.toBe(hashToken(oldRegToken))
    expect(leaderUpdate.data.tokenHash).not.toBe(hashToken(oldLeaderToken))
    expect(regUpdate.data.editTokenHash).toEqual(registrationToken.where("new-token-1").editTokenHash)
    expect(leaderUpdate.data.tokenHash).toEqual(linkToken.where("new-token-2").tokenHash)
  })

  it("gives distinct rows distinct tokens", async () => {
    const { db, calls } = fakeDb({ registrations: [regRow({ id: "r1" }), regRow({ id: "r2" })] })
    await regenerateLinks(db, { eventId: "evt-1" })
    const hashes = calls.registrationUpdates.map((u) => u.data.editTokenHash)
    expect(new Set(hashes).size).toBe(2)
  })

  it("rotates cancelled registrations too — an old link must stop working regardless of status", async () => {
    const { db, calls } = fakeDb({ registrations: [regRow({ id: "r1", status: "cancelled" })] })
    const result = await regenerateLinks(db, { eventId: "evt-1" })
    expect(calls.registrationUpdates).toHaveLength(1)
    expect(result.counts.registrations).toBe(1)
  })

  it("uses one db transaction for the rotation", async () => {
    const { db } = fakeDb({ registrations: [regRow()], leaders: [leaderRow()], invites: [inviteRow()] })
    const txSpy = vi.spyOn(db, "$transaction")
    await regenerateLinks(db, { eventId: "evt-1" })
    expect(txSpy).toHaveBeenCalledTimes(1)
  })
})

describe("regenerateLinks — resend", () => {
  it("sends one email per volunteer per event for registrations, not per row, and counts failures", async () => {
    const regs = [
      regRow({ id: "r1", volunteerId: "vol-1", eventId: "evt-1", status: "active" }),
      regRow({ id: "r2", volunteerId: "vol-1", eventId: "evt-1", status: "active" }), // same volunteer+event: no 2nd email
      regRow({ id: "r3", volunteerId: "vol-2", eventId: "evt-1", status: "active", volunteer: { firstName: "Dan", lastName: "D", email: "dan@x.ch" } }),
      regRow({ id: "r4", volunteerId: "vol-1", eventId: "evt-2", status: "active" }), // same volunteer, different event: separate email
    ]
    sendNotificationMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "smtp down" })
      .mockResolvedValueOnce({ ok: true })

    const { db } = fakeDb({ registrations: regs })
    const result = await regenerateLinks(db, { organizationId: orgA }, { resend: true })

    expect(sendNotificationMock).toHaveBeenCalledTimes(3) // vol-1/evt-1, vol-2/evt-1, vol-1/evt-2
    expect(result.resend?.registrations).toEqual({ sent: 2, failed: 1, skipped: 0 })
  })

  it("skips a volunteer whose only rows in scope are cancelled (nothing live to point to)", async () => {
    const { db } = fakeDb({ registrations: [regRow({ status: "cancelled" })] })
    const result = await regenerateLinks(db, { eventId: "evt-1" }, { resend: true })
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(result.resend?.registrations).toEqual({ sent: 0, failed: 0, skipped: 1 })
  })

  it("skips a row without an email address", async () => {
    const { db } = fakeDb({ leaders: [leaderRow({ email: "" })] })
    const result = await regenerateLinks(db, { eventId: "evt-1" }, { resend: true })
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(result.resend?.leaders).toEqual({ sent: 0, failed: 0, skipped: 1 })
  })

  it("resends leader links one per row and invite links via sendMemberInvite", async () => {
    sendNotificationMock.mockResolvedValue({ ok: true })
    sendMemberInviteMock.mockResolvedValue({ ok: false })
    const { db } = fakeDb({ leaders: [leaderRow({ id: "l1" }), leaderRow({ id: "l2", email: "other@x.ch" })], invites: [inviteRow()] })

    const result = await regenerateLinks(db, { eventId: "evt-1" }, { resend: true })

    expect(sendNotificationMock).toHaveBeenCalledTimes(2)
    expect(result.resend?.leaders).toEqual({ sent: 2, failed: 0, skipped: 0 })
    expect(sendMemberInviteMock).toHaveBeenCalledTimes(1)
    expect(result.resend?.invites).toEqual({ sent: 0, failed: 1, skipped: 0 })
  })

})

describe("countLinksInScope — dry run", () => {
  it("reports counts without changing anything", async () => {
    const { db, calls } = fakeDb({ registrations: [regRow(), regRow({ id: "r2" })], leaders: [leaderRow()], invites: [inviteRow()] })
    const counts = await countLinksInScope(db, { eventId: "evt-1" })
    expect(counts).toEqual({ registrations: 2, leaders: 1, invites: 1 })
    expect(calls.registrationUpdates).toHaveLength(0)
    expect(calls.leaderUpdates).toHaveLength(0)
    expect(calls.inviteUpdates).toHaveLength(0)
    expect(sendNotificationMock).not.toHaveBeenCalled()
  })
})

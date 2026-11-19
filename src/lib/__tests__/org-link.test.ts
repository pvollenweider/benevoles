import { describe, it, expect, vi } from "vitest"
import {
  clearOrgLinkData,
  ensureOrgLink,
  lookupOrgLink,
  newOrgLinkToken,
  orgLinkTokenData,
  orgLinkTokenWhere,
  rotateOrgLink,
  type OrgLinkDb,
  type OrgLinkRow,
} from "../org-link"
import { hashToken } from "../token-hash"

const person = { id: "vol-1", organizationId: "org-1" }

function row(over: Partial<OrgLinkRow> = {}): OrgLinkRow {
  return { orgLinkTokenHash: null, orgLinkTokenEnc: null, orgLinkTokenLegacy: null, orgLinkIssuedAt: null, ...over }
}

function fakeDb(first: OrgLinkRow | null, afterUpdate?: OrgLinkRow, updateCounts: number[] = []) {
  let update = 0
  const calls = { findFirst: [] as unknown[], updateMany: [] as unknown[] }
  const db: OrgLinkDb = {
    volunteer: {
      // Two overloads in the interface; one implementation serves both in the test.
      findFirst: vi.fn(async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
        calls.findFirst.push(args)
        if (args.select && "organization" in args.select) {
          return { ...person, firstName: "Léa", lastName: "M", email: "lea@example.ch", organization: { id: "org-1", name: "Asso", slug: "asso", timeZone: "Europe/Zurich", active: true, suspendedAt: null } } as never
        }
        return (calls.findFirst.length === 1 ? first : afterUpdate ?? first) as never
      }) as OrgLinkDb["volunteer"]["findFirst"],
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.updateMany.push(args)
        return { count: updateCounts[update++] ?? 1 }
      }),
    },
  }
  return { db, calls }
}

describe("orgLinkTokenData", () => {
  it("stores a 32-byte base64url token by hash, and a clear value only while no key is configured", () => {
    const token = newOrgLinkToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const data = orgLinkTokenData(token, new Date("2031-01-01T00:00:00Z"))
    expect(data.orgLinkTokenHash).toBe(hashToken(token))
    expect(data.orgLinkTokenLegacy).toBe(token)
    expect(data.orgLinkTokenEnc).toBeNull()
    expect(data.orgLinkIssuedAt).toEqual(new Date("2031-01-01T00:00:00Z"))
    expect(orgLinkTokenWhere(token)).toEqual({ orgLinkTokenHash: hashToken(token) })
  })

  it("gives two calls different tokens", () => {
    expect(newOrgLinkToken()).not.toBe(newOrgLinkToken())
  })

  it("clears every column at once, so no half-revoked row stays", () => {
    expect(clearOrgLinkData()).toEqual({
      orgLinkTokenHash: null,
      orgLinkTokenEnc: null,
      orgLinkTokenLegacy: null,
      orgLinkIssuedAt: null,
    })
  })
})

describe("ensureOrgLink: lazy issue, concurrency-safe", () => {
  it("issues one when the volunteer has none, in one conditional update", async () => {
    const { db, calls } = fakeDb(row())
    const issued = await ensureOrgLink(db, person.id, person.organizationId, new Date("2031-01-01T00:00:00Z"))
    expect(issued?.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(calls.updateMany).toHaveLength(1)
    expect(calls.updateMany[0]).toMatchObject({ where: { id: "vol-1", organizationId: "org-1", orgLinkTokenHash: null } })
    expect((calls.updateMany[0] as { data: Record<string, unknown> }).data.orgLinkTokenHash).toBe(hashToken(issued!.token))
  })

  it("returns the existing token without writing", async () => {
    const token = newOrgLinkToken()
    const stored = orgLinkTokenData(token)
    const { db, calls } = fakeDb(row(stored))
    const issued = await ensureOrgLink(db, person.id, person.organizationId)
    expect(issued?.token).toBe(token)
    expect(calls.updateMany).toHaveLength(0)
  })

  it("a lost race reads the winner's token instead of issuing a second one", async () => {
    const winner = newOrgLinkToken()
    const after = row(orgLinkTokenData(winner))
    const { db, calls } = fakeDb(row(), after, [0])
    const issued = await ensureOrgLink(db, person.id, person.organizationId)
    expect(issued?.token).toBe(winner)
    // One attempt lost, then the winner's row is read and returned.
    expect(calls.updateMany).toHaveLength(1)
    expect(calls.findFirst).toHaveLength(2)
  })

  it("returns null outside the volunteer's organisation", async () => {
    const { db } = fakeDb(null)
    expect(await ensureOrgLink(db, "vol-other", "org-1")).toBeNull()
  })
})

describe("rotateOrgLink: one winner, old hash invalid at once", () => {
  it("writes a new token only when the expected hash still matches", async () => {
    const old = newOrgLinkToken()
    const expected = hashToken(old)
    const { db, calls } = fakeDb(row({ orgLinkTokenHash: expected }))
    const rotated = await rotateOrgLink(db, { volunteerId: "vol-1", organizationId: "org-1", expectedHash: expected })
    expect(rotated?.token).not.toBe(old)
    expect(calls.updateMany[0]).toMatchObject({ where: { id: "vol-1", organizationId: "org-1", orgLinkTokenHash: expected } })
    expect((calls.updateMany[0] as { data: Record<string, unknown> }).data.orgLinkTokenHash).not.toBe(expected)
  })

  it("returns null when another request already rotated it", async () => {
    const { db, calls } = fakeDb(row({ orgLinkTokenHash: "stale" }), undefined, [0])
    const rotated = await rotateOrgLink(db, { volunteerId: "vol-1", organizationId: "org-1", expectedHash: "stale" })
    expect(rotated).toBeNull()
    expect(calls.updateMany).toHaveLength(1)
  })
})

describe("lookupOrgLink", () => {
  it("looks a token up by its hash and returns the organisation", async () => {
    const { db, calls } = fakeDb(null)
    const token = newOrgLinkToken()
    const target = await lookupOrgLink(db, token)
    expect(calls.findFirst[0]).toMatchObject({ where: { orgLinkTokenHash: hashToken(token) } })
    expect(target).toMatchObject({ id: "vol-1", organizationId: "org-1", organization: { name: "Asso", slug: "asso" } })
  })
})

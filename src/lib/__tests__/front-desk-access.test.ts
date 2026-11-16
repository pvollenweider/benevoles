import { describe, it, expect, vi } from "vitest"

vi.mock("../prisma", () => ({ prisma: {} }))

import { isGrantLive, loadFrontDeskGrant } from "../front-desk-access"

// Front-desk access limited to one event (#1142): when a grant counts.
const NOW = new Date("2027-06-12T09:00:00Z")
const live = { revokedAt: null, expiresAt: null }
const published = { publicStatus: "published" }

describe("isGrantLive", () => {
  it("a grant neither revoked nor expired, on an event that is not archived, counts", () => {
    expect(isGrantLive(live, published, NOW)).toBe(true)
    expect(isGrantLive(live, { publicStatus: "draft" }, NOW)).toBe(true)
  })

  it("no grant, or no event: nothing counts", () => {
    expect(isGrantLive(null, published, NOW)).toBe(false)
    expect(isGrantLive(undefined, published, NOW)).toBe(false)
    expect(isGrantLive(live, null, NOW)).toBe(false)
    expect(isGrantLive(live, undefined, NOW)).toBe(false)
  })

  it("a revoked grant is dead, whenever it was revoked, even with an expiry still ahead", () => {
    expect(isGrantLive({ ...live, revokedAt: new Date("2027-06-12T08:59:59Z") }, published, NOW)).toBe(false)
    expect(isGrantLive({ revokedAt: new Date("2027-06-01T00:00:00Z"), expiresAt: new Date("2027-12-31T00:00:00Z") }, published, NOW)).toBe(false)
    // Dated after « now » (clock skew between servers): revoked all the same.
    expect(isGrantLive({ ...live, revokedAt: new Date("2027-06-12T09:00:01Z") }, published, NOW)).toBe(false)
  })

  it("an expiry in the past is dead, the instant itself included; one ahead counts", () => {
    expect(isGrantLive({ ...live, expiresAt: new Date("2027-06-12T08:59:59.999Z") }, published, NOW)).toBe(false)
    expect(isGrantLive({ ...live, expiresAt: new Date(NOW) }, published, NOW)).toBe(false)
    expect(isGrantLive({ ...live, expiresAt: new Date("2027-06-12T09:00:00.001Z") }, published, NOW)).toBe(true)
  })

  it("an archived event gives no access, whatever the grant says", () => {
    expect(isGrantLive(live, { publicStatus: "archived" }, NOW)).toBe(false)
    expect(isGrantLive({ ...live, expiresAt: new Date("2027-12-31T00:00:00Z") }, { publicStatus: "archived" }, NOW)).toBe(false)
  })

  it("no implicit expiry from the event's dates: without `expiresAt`, a grant stays live until revoked or archived", () => {
    // The rule of this change (see the function's comment): only `expiresAt` ends a grant in time.
    expect(isGrantLive(live, published, new Date("2031-01-01T00:00:00Z"))).toBe(true)
  })
})

describe("loadFrontDeskGrant", () => {
  const input = { adminUserId: "adm-colette", organizationId: "org-fete", eventId: "evt-fete", now: NOW }
  const row = (over: Record<string, unknown> = {}) => ({
    id: "grant-1", adminUserId: "adm-colette", eventId: "evt-fete", organizationId: "org-fete", expiresAt: null, revokedAt: null,
    adminUser: { organizationId: "org-fete", isActive: true, role: "front_desk" },
    event: { id: "evt-fete", organizationId: "org-fete", publicStatus: "published" },
    ...over,
  })
  const reader = (found: unknown) => {
    const findFirst = vi.fn().mockResolvedValue(found)
    return { db: { adminEventAccess: { findFirst } } as never, findFirst }
  }

  it("asks for the grant of this account, this event and this organisation, with an active front-desk account and an event of the organisation", async () => {
    const { db, findFirst } = reader(row())
    expect(await loadFrontDeskGrant(input, db)).toEqual({ id: "grant-1", adminUserId: "adm-colette", eventId: "evt-fete", organizationId: "org-fete", expiresAt: null })
    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(findFirst.mock.calls[0][0].where).toEqual({
      adminUserId: "adm-colette", eventId: "evt-fete", organizationId: "org-fete",
      adminUser: { organizationId: "org-fete", isActive: true, role: "front_desk" },
      event: { organizationId: "org-fete" },
    })
  })

  it("null when there is no row, and without a query when an id is missing", async () => {
    expect(await loadFrontDeskGrant(input, reader(null).db)).toBeNull()
    for (const missing of ["adminUserId", "organizationId", "eventId"] as const) {
      const { db, findFirst } = reader(row())
      expect(await loadFrontDeskGrant({ ...input, [missing]: "" }, db)).toBeNull()
      expect(findFirst).not.toHaveBeenCalled()
    }
  })

  // Each fact is checked again on the row read: the answer does not rest on the `where` alone.
  it.each([
    ["another account's grant", row({ adminUserId: "adm-autre" })],
    ["a grant on another event", row({ eventId: "evt-marche" })],
    ["a grant of another organisation", row({ organizationId: "org-tournoi" })],
    ["an event of another organisation", row({ event: { id: "evt-fete", organizationId: "org-tournoi", publicStatus: "published" } })],
    ["an event row that is not the one asked for", row({ event: { id: "evt-marche", organizationId: "org-fete", publicStatus: "published" } })],
    ["an account of another organisation", row({ adminUser: { organizationId: "org-tournoi", isActive: true, role: "front_desk" } })],
    ["a deactivated account", row({ adminUser: { organizationId: "org-fete", isActive: false, role: "front_desk" } })],
    ["an account that is not a front-desk account", row({ adminUser: { organizationId: "org-fete", isActive: true, role: "organizer" } })],
    ["a missing account", row({ adminUser: null })],
    ["a missing event", row({ event: null })],
    ["a revoked grant", row({ revokedAt: new Date("2027-06-12T08:00:00Z") })],
    ["an expired grant", row({ expiresAt: new Date("2027-06-12T08:00:00Z") })],
    ["an archived event", row({ event: { id: "evt-fete", organizationId: "org-fete", publicStatus: "archived" } })],
  ])("null for %s, even if the query returned it", async (_label, found) => {
    expect(await loadFrontDeskGrant(input, reader(found).db)).toBeNull()
  })

  it("uses the `now` it is given", async () => {
    const expiring = row({ expiresAt: new Date("2027-06-12T10:00:00Z") })
    expect(await loadFrontDeskGrant(input, reader(expiring).db)).not.toBeNull()
    expect(await loadFrontDeskGrant({ ...input, now: new Date("2027-06-12T10:00:00Z") }, reader(expiring).db)).toBeNull()
  })
})

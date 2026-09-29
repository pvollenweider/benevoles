import { describe, it, expect, vi } from "vitest"
import {
  capped, eventWhere, membersHref, registrationWhere, registrationsHref, searchTerms, shiftHref, shiftWhere, volunteerWhere,
  SEARCH_GROUP_LIMIT, SEARCH_MAX_LENGTH, SEARCH_MAX_TERMS,
} from "../admin-search"
import { loadSearch } from "../admin-search-data"
import type { OrgScopedPrisma } from "../prisma-org"

const ci = (t: string) => ({ contains: t, mode: "insensitive" })

describe("searchTerms", () => {
  it("splits on whitespace, trims, drops empty words", () => {
    expect(searchTerms("  Alice   Martin ")).toEqual(["Alice", "Martin"])
    expect(searchTerms("")).toEqual([])
    expect(searchTerms("   ")).toEqual([])
    expect(searchTerms(undefined)).toEqual([])
  })

  it("removes case-insensitive duplicates, keeping the first spelling", () => {
    expect(searchTerms("bar Bar BAR buvette")).toEqual(["bar", "buvette"])
  })

  it("caps the number of words and the query length", () => {
    expect(searchTerms("a b c d e f g")).toHaveLength(SEARCH_MAX_TERMS)
    const long = "x".repeat(SEARCH_MAX_LENGTH + 50)
    expect(searchTerms(long)[0]).toHaveLength(SEARCH_MAX_LENGTH)
  })
})

describe("where clauses", () => {
  it("volunteers: every word in some of name, email, phone", () => {
    expect(volunteerWhere(["alice", "079"])).toEqual({
      AND: [
        { OR: [{ firstName: ci("alice") }, { lastName: ci("alice") }, { email: ci("alice") }, { phone: ci("alice") }] },
        { OR: [{ firstName: ci("079") }, { lastName: ci("079") }, { email: ci("079") }, { phone: ci("079") }] },
      ],
    })
  })

  it("events: title, location, slug", () => {
    expect(eventWhere(["fete"])).toEqual({ AND: [{ OR: [{ title: ci("fete") }, { location: ci("fete") }, { slug: ci("fete") }] }] })
  })

  it("shifts: role, label or event title, cancelled shifts excluded", () => {
    expect(shiftWhere(["bar"])).toEqual({
      status: { not: "cancelled" },
      AND: [{ OR: [{ roleName: ci("bar") }, { label: ci("bar") }, { event: { title: ci("bar") } }] }],
    })
  })

  it("registrations: live statuses of matching volunteers", () => {
    expect(registrationWhere(["alice"])).toEqual({
      status: { in: ["active", "waiting", "offered"] },
      volunteer: volunteerWhere(["alice"]),
    })
  })
})

describe("links", () => {
  it("singles out a volunteer by email, or by full name without one", () => {
    expect(membersHref({ firstName: "Alice", lastName: "Martin", email: "a+b@x.ch" })).toBe("/admin/members?q=a%2Bb%40x.ch")
    expect(membersHref({ firstName: "Zoé", lastName: "Roy", email: null })).toBe(`/admin/members?q=${encodeURIComponent("Zoé Roy")}`)
    expect(registrationsHref("ev1", { firstName: "A", lastName: "B", email: "a@x.ch" })).toBe("/admin/events/ev1/registrations?q=a%40x.ch")
  })

  it("links a shift to the registrations filtered on it", () => {
    expect(shiftHref("ev1", "sh1")).toBe("/admin/events/ev1/registrations?shift=sh1")
  })
})

describe("capped", () => {
  it("reports whether rows beyond the limit were found", () => {
    const rows = Array.from({ length: SEARCH_GROUP_LIMIT + 1 }, (_, i) => i)
    expect(capped(rows)).toEqual({ items: rows.slice(0, SEARCH_GROUP_LIMIT), more: true })
    expect(capped([1, 2])).toEqual({ items: [1, 2], more: false })
  })
})

describe("loadSearch", () => {
  it("queries the four groups through the given (org-scoped) client, one row past the limit", async () => {
    const many = Array.from({ length: SEARCH_GROUP_LIMIT + 1 }, (_, i) => ({ id: String(i) }))
    const db = {
      volunteer: { findMany: vi.fn().mockResolvedValue(many) },
      registration: { findMany: vi.fn().mockResolvedValue([{ id: "r" }]) },
      event: { findMany: vi.fn().mockResolvedValue([]) },
      shift: { findMany: vi.fn().mockResolvedValue([{ id: "s" }]) },
    }
    const res = await loadSearch(db as unknown as OrgScopedPrisma, ["bar"])

    expect(db.volunteer.findMany.mock.calls[0][0]).toMatchObject({ where: volunteerWhere(["bar"]), take: SEARCH_GROUP_LIMIT + 1 })
    expect(db.registration.findMany.mock.calls[0][0]).toMatchObject({ where: registrationWhere(["bar"]), take: SEARCH_GROUP_LIMIT + 1 })
    expect(db.event.findMany.mock.calls[0][0]).toMatchObject({ where: eventWhere(["bar"]), take: SEARCH_GROUP_LIMIT + 1 })
    expect(db.shift.findMany.mock.calls[0][0]).toMatchObject({ where: shiftWhere(["bar"]), take: SEARCH_GROUP_LIMIT + 1 })
    expect(res.volunteers.more).toBe(true)
    expect(res.volunteers.items).toHaveLength(SEARCH_GROUP_LIMIT)
    expect(res.registrations).toEqual({ items: [{ id: "r" }], more: false })
    expect(res.events).toEqual({ items: [], more: false })
  })
})

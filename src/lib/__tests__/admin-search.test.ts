import { describe, it, expect, vi } from "vitest"
import {
  capped, likePattern, membersHref, registrationWhere, registrationsHref, searchTerms, shiftHref,
  SEARCH_GROUP_LIMIT, SEARCH_ID_LIMIT, SEARCH_MAX_LENGTH, SEARCH_MAX_TERMS,
} from "../admin-search"
import { eventIdsSql, shiftIdsSql, volunteerIdsSql } from "../admin-search-sql"
import { loadSearch } from "../admin-search-data"
import type { OrgScopedPrisma } from "../prisma-org"

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

describe("raw matches (#390)", () => {
  it("escapes LIKE wildcards in a term", () => {
    expect(likePattern("zoe")).toBe("%zoe%")
    expect(likePattern("100%_a\\b")).toBe("%100\\%\\_a\\\\b%")
  })

  it("volunteers: every word against name, email, phone, folded on both sides, within the organization", () => {
    const sql = volunteerIdsSql("org-a", ["Zoé", "079"])
    const text = sql.text
    expect(text).toContain('FROM "Volunteer" v WHERE v."organizationId" = $1')
    expect(text.match(/unaccent\(lower\(concat_ws/g)).toHaveLength(2)
    expect(text).toContain("LIKE unaccent(lower($2)) ESCAPE")
    expect(text).toContain("LIKE unaccent(lower($3)) ESCAPE")
    expect(sql.values).toEqual(["org-a", "%Zoé%", "%079%", SEARCH_ID_LIMIT])
  })

  it("events and shifts: organization filter first, cancelled shifts excluded", () => {
    const ev = eventIdsSql("org-a", ["fete"])
    expect(ev.text).toContain('FROM "Event" e WHERE e."organizationId" = $1')
    expect(ev.values[0]).toBe("org-a")
    const sh = shiftIdsSql("org-a", ["bar"])
    expect(sh.text).toContain('JOIN "Event" e ON e."id" = s."eventId" WHERE e."organizationId" = $1 AND s."status" <> \'cancelled\'')
    expect(sh.text).toContain('e."title"')
    expect(sh.values[0]).toBe("org-a")
  })

  it("registrations: live statuses of the matched volunteers", () => {
    expect(registrationWhere(["v1", "v2"])).toEqual({
      status: { in: ["active", "waiting", "offered", "requested"] },
      volunteerId: { in: ["v1", "v2"] },
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
  it("matches ids with the organization's raw queries, then reads the rows through the scoped client, one past the limit", async () => {
    const many = Array.from({ length: SEARCH_GROUP_LIMIT + 1 }, (_, i) => ({ id: String(i) }))
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "v1" }, { id: "v2" }]),
      volunteer: { findMany: vi.fn().mockResolvedValue(many) },
      registration: { findMany: vi.fn().mockResolvedValue([{ id: "r" }]) },
      event: { findMany: vi.fn().mockResolvedValue([]) },
      shift: { findMany: vi.fn().mockResolvedValue([{ id: "s" }]) },
    }
    const res = await loadSearch(db as unknown as OrgScopedPrisma, "org-a", ["bar"])

    expect(db.$queryRaw).toHaveBeenCalledTimes(3)
    for (const call of db.$queryRaw.mock.calls) expect(call[0].values[0]).toBe("org-a")
    expect(db.volunteer.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["v1", "v2"] } }, take: SEARCH_GROUP_LIMIT + 1 })
    expect(db.registration.findMany.mock.calls[0][0]).toMatchObject({ where: registrationWhere(["v1", "v2"]), take: SEARCH_GROUP_LIMIT + 1 })
    expect(db.event.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["v1", "v2"] } }, take: SEARCH_GROUP_LIMIT + 1 })
    expect(db.shift.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["v1", "v2"] } }, take: SEARCH_GROUP_LIMIT + 1 })
    expect(res.volunteers.more).toBe(true)
    expect(res.volunteers.items).toHaveLength(SEARCH_GROUP_LIMIT)
    expect(res.registrations).toEqual({ items: [{ id: "r" }], more: false })
    expect(res.events).toEqual({ items: [], more: false })
  })
})

import { describe, it, expect, vi } from "vitest"

vi.mock("../prisma", () => ({ prisma: {} }))

import { FRONT_DESK_LAST_DAY_GRACE, formatFrontDeskDay, frontDeskAccessEnd, frontDeskAccessEndAt, frontDeskAccountPurgeDecision, frontDeskAccessStatus, isGrantLive, listEventFrontDeskAccesses, loadFrontDeskAccesses, loadFrontDeskGrant } from "../front-desk-access"

// Front-desk access limited to one event (#1142): when a grant counts.
const NOW = new Date("2027-06-12T09:00:00Z")
const live = { revokedAt: null, expiresAt: null }
/** A published event whose last day is 20 June 2027, in Zurich (UTC+2 in June). */
const published = { publicStatus: "published", endDate: new Date("2027-06-20T00:00:00Z"), timeZone: "Europe/Zurich" }
const archived = { ...published, publicStatus: "archived" }

describe("frontDeskAccessEnd", () => {
  it("ends the morning after the event's last day, at 06:00 in the organisation's zone", () => {
    // 21 June 2027 06:00 +02:00 = 04:00 UTC.
    expect(frontDeskAccessEnd(published).toISOString()).toBe("2027-06-21T04:00:00.000Z")
    expect(FRONT_DESK_LAST_DAY_GRACE).toBe("06:00")
  })

  it("reads the zone it is given, not the server's (a Pacific event ends hours later in UTC)", () => {
    const losAngeles = frontDeskAccessEnd({ endDate: new Date("2027-06-20T00:00:00Z"), timeZone: "America/Los_Angeles" })
    // 21 June 2027 06:00 -07:00 = 13:00 UTC.
    expect(losAngeles.toISOString()).toBe("2027-06-21T13:00:00.000Z")
    expect(frontDeskAccessEnd({ endDate: new Date("2027-06-20T00:00:00Z"), timeZone: "UTC" }).toISOString()).toBe("2027-06-21T06:00:00.000Z")
  })

  it("keeps 06:00 local across a daylight-saving change", () => {
    // Zurich switches to summer time on 28 March 2027: 06:00 is +01:00 before, +02:00 from that day.
    expect(frontDeskAccessEnd({ endDate: new Date("2027-03-25T00:00:00Z"), timeZone: "Europe/Zurich" }).toISOString()).toBe("2027-03-26T05:00:00.000Z")
    expect(frontDeskAccessEnd({ endDate: new Date("2027-03-27T00:00:00Z"), timeZone: "Europe/Zurich" }).toISOString()).toBe("2027-03-28T04:00:00.000Z")
    expect(frontDeskAccessEnd({ endDate: new Date("2027-03-28T00:00:00Z"), timeZone: "Europe/Zurich" }).toISOString()).toBe("2027-03-29T04:00:00.000Z")
    // Back to winter time on 31 October 2027: 06:00 is +01:00 on 1 November.
    expect(frontDeskAccessEnd({ endDate: new Date("2027-10-31T00:00:00Z"), timeZone: "Europe/Zurich" }).toISOString()).toBe("2027-11-01T05:00:00.000Z")
  })
})

describe("frontDeskAccountPurgeDecision", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
  const at = (iso: string) => new Date(iso)
  const access = (over: Record<string, unknown> = {}) => ({
    revokedAt: null,
    expiresAt: null,
    event: { endDate: day("2027-06-20") },
    ...over,
  })
  const account = (over: Record<string, unknown> = {}) => ({
    createdAt: at("2027-01-01T00:00:00Z"),
    accesses: [access()],
    ...over,
  })
  const zone = "Europe/Zurich"
  // 21 June 2027 06:00 Zurich = 04:00 UTC; 90 days later = 19 September 2027 04:00 UTC.
  const eventEnd = at("2027-06-21T04:00:00Z")
  const deadline = at("2027-09-19T04:00:00Z")

  it("ends an access at its event's end when it was neither revoked nor expired", () => {
    expect(frontDeskAccessEndAt(access(), zone)).toEqual(eventEnd)
    expect(frontDeskAccountPurgeDecision(account(), zone, deadline)).toEqual({ referenceAt: eventEnd, due: false })
  })

  it("uses the earliest end: a revocation or an expiry before the event ends it there", () => {
    const revoked = at("2027-03-01T12:00:00Z")
    const expired = at("2027-02-01T12:00:00Z")
    expect(frontDeskAccessEndAt(access({ revokedAt: revoked }), zone)).toEqual(revoked)
    expect(frontDeskAccessEndAt(access({ expiresAt: expired }), zone)).toEqual(expired)
    // Both set: the earliest of the three wins, never the latest.
    expect(frontDeskAccessEndAt(access({ revokedAt: revoked, expiresAt: expired }), zone)).toEqual(expired)
    // An expiry later than the event never extends the access.
    expect(frontDeskAccessEndAt(access({ expiresAt: at("2028-01-01T00:00:00Z") }), zone)).toEqual(eventEnd)
  })

  it("takes the latest end among several accesses, whatever ended each one", () => {
    const mixed = account({
      accesses: [
        access({ revokedAt: at("2027-01-10T00:00:00Z"), event: { endDate: day("2027-05-01") } }),
        access({ expiresAt: at("2027-04-01T00:00:00Z"), event: { endDate: day("2027-05-01") } }),
        access({ event: { endDate: day("2027-06-20") } }),
      ],
    })
    expect(frontDeskAccountPurgeDecision(mixed, zone, deadline)).toEqual({ referenceAt: eventEnd, due: false })
  })

  it("keeps an account with one live access among old ones", () => {
    const stillLive = account({
      accesses: [
        access({ revokedAt: at("2027-01-01T00:00:00Z") }),
        // An event far in the future: the account's reference date is the latest of its ends.
        access({ event: { endDate: day("2028-06-20") } }),
      ],
    })
    const decision = frontDeskAccountPurgeDecision(stillLive, zone, at("2027-12-31T00:00:00Z"))
    expect(decision.referenceAt).toEqual(at("2028-06-21T04:00:00Z"))
    expect(decision.due).toBe(false)
  })

  it("counts an account with no access at all from its creation", () => {
    const empty = account({ accesses: [], createdAt: at("2027-01-01T00:00:00Z") })
    expect(frontDeskAccountPurgeDecision(empty, zone, at("2027-04-01T00:00:00Z"))).toEqual({ referenceAt: at("2027-01-01T00:00:00Z"), due: false })
    expect(frontDeskAccountPurgeDecision(empty, zone, at("2027-04-01T00:00:00.001Z")).due).toBe(true)
  })

  it("reads the organisation's zone, not the server's", () => {
    const event = { endDate: day("2027-06-20") }
    const zurich = frontDeskAccessEndAt(access({ event }), "Europe/Zurich")
    const losAngeles = frontDeskAccessEndAt(access({ event }), "America/Los_Angeles")
    const utc = frontDeskAccessEndAt(access({ event }), "UTC")
    expect(zurich.toISOString()).toBe("2027-06-21T04:00:00.000Z")
    expect(losAngeles.toISOString()).toBe("2027-06-21T13:00:00.000Z")
    expect(utc.toISOString()).toBe("2027-06-21T06:00:00.000Z")
    expect(frontDeskAccountPurgeDecision(account({ accesses: [access({ event })] }), "Europe/Zurich", deadline).referenceAt).toEqual(zurich)
  })

  it("lands on 06:00 local across a daylight-saving change", () => {
    // Zurich switches to summer time on 28 March 2027.
    const before = frontDeskAccountPurgeDecision(account({ accesses: [access({ event: { endDate: day("2027-03-27") } })] }), zone, at("2027-06-01T00:00:00Z"))
    const after = frontDeskAccountPurgeDecision(account({ accesses: [access({ event: { endDate: day("2027-03-28") } })] }), zone, at("2027-06-01T00:00:00Z"))
    expect(before.referenceAt.toISOString()).toBe("2027-03-28T04:00:00.000Z")
    expect(after.referenceAt.toISOString()).toBe("2027-03-29T04:00:00.000Z")
  })

  it("stays due only strictly after 90 days, to the millisecond", () => {
    expect(frontDeskAccountPurgeDecision(account(), zone, new Date(deadline.getTime() - 1)).due).toBe(false)
    // Exactly 90 days: still kept.
    expect(frontDeskAccountPurgeDecision(account(), zone, deadline).due).toBe(false)
    expect(frontDeskAccountPurgeDecision(account(), zone, new Date(deadline.getTime() + 1)).due).toBe(true)
  })
})

describe("formatFrontDeskDay", () => {
  it("words the stored UTC calendar day, never the runtime zone's day", () => {
    // 23:00 UTC on 13 June is already 14 June in Zurich: the stored day is the 13th.
    expect(formatFrontDeskDay(new Date("2027-06-13T23:00:00Z"))).toBe("13 juin 2027")
    expect(formatFrontDeskDay("2027-06-14")).toBe("14 juin 2027")
  })
})

describe("isGrantLive", () => {
  it("a grant neither revoked nor expired, on an event that is not archived, counts", () => {
    expect(isGrantLive(live, published, NOW)).toBe(true)
    expect(isGrantLive(live, { ...published, publicStatus: "draft" }, NOW)).toBe(true)
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
    expect(isGrantLive(live, archived, NOW)).toBe(false)
    expect(isGrantLive({ ...live, expiresAt: new Date("2027-12-31T00:00:00Z") }, archived, NOW)).toBe(false)
  })

  it("ends with the event, in its organisation's zone, even without expiresAt", () => {
    // 21 June 2027 06:00 Zurich = 04:00 UTC: the instant itself is already over.
    expect(isGrantLive(live, published, new Date("2027-06-21T03:59:59.999Z"))).toBe(true)
    expect(isGrantLive(live, published, new Date("2027-06-21T04:00:00.000Z"))).toBe(false)
    // A night shift on the last day still has until 06:00 the next morning.
    expect(isGrantLive(live, published, new Date("2027-06-21T02:00:00.000Z"))).toBe(true)
  })

  it("the event's own end wins: an expiresAt set past it never extends the access", () => {
    expect(isGrantLive({ ...live, expiresAt: new Date("2027-12-31T00:00:00Z") }, published, new Date("2027-06-21T04:00:00Z"))).toBe(false)
  })

  it("an earlier expiresAt still ends it earlier", () => {
    expect(isGrantLive({ ...live, expiresAt: new Date("2027-06-19T00:00:00Z") }, published, new Date("2027-06-19T00:00:00Z"))).toBe(false)
  })
})

describe("frontDeskAccessStatus", () => {
  const event = { publicStatus: "published", endDate: new Date("2027-06-20T00:00:00Z"), timeZone: "Europe/Zurich" }
  it("names each state, revoked first", () => {
    expect(frontDeskAccessStatus({ revokedAt: null, expiresAt: null, isActive: true, event }, NOW)).toBe("active")
    expect(frontDeskAccessStatus({ revokedAt: null, expiresAt: null, isActive: false, event }, NOW)).toBe("invitation_sent")
    expect(frontDeskAccessStatus({ revokedAt: new Date("2027-06-01T00:00:00Z"), expiresAt: null, isActive: true, event }, NOW)).toBe("revoked")
    expect(frontDeskAccessStatus({ revokedAt: null, expiresAt: new Date("2027-06-01T00:00:00Z"), isActive: true, event }, NOW)).toBe("expired")
    expect(frontDeskAccessStatus({ revokedAt: null, expiresAt: null, isActive: true, event }, new Date("2027-06-21T04:00:00Z"))).toBe("expired")
  })
})

describe("loadFrontDeskGrant", () => {
  const input = { adminUserId: "adm-colette", organizationId: "org-fete", eventId: "evt-fete", now: NOW }
  const row = (over: Record<string, unknown> = {}) => ({
    id: "grant-1", adminUserId: "adm-colette", eventId: "evt-fete", organizationId: "org-fete", expiresAt: null, revokedAt: null,
    adminUser: { organizationId: "org-fete", isActive: true, role: "front_desk" },
    event: {
      id: "evt-fete", organizationId: "org-fete", publicStatus: "published", title: "Fête du village",
      startDate: new Date("2027-06-12T00:00:00Z"), endDate: new Date("2027-06-20T00:00:00Z"),
      organization: { name: "Fête du village", timeZone: "Europe/Zurich" },
    },
    ...over,
  })
  const reader = (found: unknown) => {
    const findFirst = vi.fn().mockResolvedValue(found)
    return { db: { adminEventAccess: { findFirst } } as never, findFirst }
  }

  it("asks for the grant of this account, this event and this organisation, with an active front-desk account and an event of the organisation", async () => {
    const { db, findFirst } = reader(row())
    expect(await loadFrontDeskGrant(input, db)).toEqual({
      id: "grant-1", adminUserId: "adm-colette", eventId: "evt-fete", organizationId: "org-fete", expiresAt: null,
      event: {
        id: "evt-fete", title: "Fête du village", startDate: new Date("2027-06-12T00:00:00Z"), endDate: new Date("2027-06-20T00:00:00Z"),
        publicStatus: "published", timeZone: "Europe/Zurich", organizationName: "Fête du village",
      },
    })
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
    ["an event of another organisation", row({ event: { ...(row().event as object), organizationId: "org-tournoi" } })],
    ["an event row that is not the one asked for", row({ event: { ...(row().event as object), id: "evt-marche" } })],
    ["an account of another organisation", row({ adminUser: { organizationId: "org-tournoi", isActive: true, role: "front_desk" } })],
    ["a deactivated account", row({ adminUser: { organizationId: "org-fete", isActive: false, role: "front_desk" } })],
    ["an account that is not a front-desk account", row({ adminUser: { organizationId: "org-fete", isActive: true, role: "organizer" } })],
    ["a missing account", row({ adminUser: null })],
    ["a missing event", row({ event: null })],
    ["a revoked grant", row({ revokedAt: new Date("2027-06-12T08:00:00Z") })],
    ["an expired grant", row({ expiresAt: new Date("2027-06-12T08:00:00Z") })],
    ["an archived event", row({ event: { ...(row().event as object), publicStatus: "archived" } })],
    ["an event that ended yesterday", row({ event: { ...(row().event as object), endDate: new Date("2027-06-11T00:00:00Z") } })],
  ])("null for %s, even if the query returned it", async (_label, found) => {
    expect(await loadFrontDeskGrant(input, reader(found).db)).toBeNull()
  })

  it("uses the `now` it is given", async () => {
    const expiring = row({ expiresAt: new Date("2027-06-12T10:00:00Z") })
    expect(await loadFrontDeskGrant(input, reader(expiring).db)).not.toBeNull()
    expect(await loadFrontDeskGrant({ ...input, now: new Date("2027-06-12T10:00:00Z") }, reader(expiring).db)).toBeNull()
  })
})

const accessRow = (over: Record<string, unknown> = {}) => ({
  id: "grant-1", revokedAt: null, expiresAt: null, eventId: "evt-fete",
  adminUser: { name: "Léa Favre", email: "lea.favre@example.org", isActive: true, role: "front_desk" },
  event: {
    id: "evt-fete", organizationId: "org-fete", title: "Fête du village", publicStatus: "published",
    startDate: new Date("2027-06-12T00:00:00Z"), endDate: new Date("2027-06-20T00:00:00Z"),
    organization: { timeZone: "Europe/Zurich" },
  },
  ...over,
})
const listReader = (rows: unknown[]) => ({ adminEventAccess: { findMany: vi.fn().mockResolvedValue(rows) } })

describe("listEventFrontDeskAccesses", () => {
  it("returns name, email, status and end date, never a token or a hash", async () => {
    const db = listReader([accessRow()]) as never
    const rows = await listEventFrontDeskAccesses(db, "evt-fete", NOW)
    expect(rows).toEqual([{ id: "grant-1", name: "Léa Favre", email: "lea.favre@example.org", status: "active", endsOn: "2027-06-20", endsOnLabel: "20 juin 2027" }])
    expect(JSON.stringify(rows)).not.toMatch(/token|hash|setup/i)
  })

  it("words each state and leaves another event's row out", async () => {
    const db = listReader([
      accessRow({ id: "g-active" }),
      accessRow({ id: "g-invited", adminUser: { name: "Sacha Bonvin", email: "sacha.bonvin@example.org", isActive: false, role: "front_desk" } }),
      accessRow({ id: "g-revoked", revokedAt: new Date("2027-06-01T00:00:00Z") }),
      accessRow({ id: "g-expired", expiresAt: new Date("2027-06-01T00:00:00Z") }),
      accessRow({ id: "g-other", event: { ...(accessRow().event as object), id: "evt-marche" } }),
    ]) as never
    const rows = await listEventFrontDeskAccesses(db, "evt-fete", NOW)
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ["g-active", "active"], ["g-invited", "invitation_sent"], ["g-revoked", "revoked"], ["g-expired", "expired"],
    ])
  })

  it("lists nothing once a purged account's grant has cascaded away, so the panel's count is zero", async () => {
    const db = listReader([]) as never
    await expect(listEventFrontDeskAccesses(db, "evt-fete", NOW)).resolves.toEqual([])
  })
})

describe("loadFrontDeskAccesses (landing page)", () => {
  it("lists the live accesses of this account and organisation only, earliest event first", async () => {
    const db = listReader([
      accessRow({ id: "g-late", eventId: "evt-marche", event: { ...(accessRow().event as object), id: "evt-marche", title: "Marché de Noël", startDate: new Date("2027-12-01T00:00:00Z"), endDate: new Date("2027-12-02T00:00:00Z") } }),
      accessRow({ id: "g-live" }),
      accessRow({ id: "g-revoked", revokedAt: new Date("2027-06-01T00:00:00Z") }),
      accessRow({ id: "g-expired", expiresAt: new Date("2027-06-01T00:00:00Z") }),
      accessRow({ id: "g-archived", event: { ...(accessRow().event as object), publicStatus: "archived" } }),
      accessRow({ id: "g-ended", event: { ...(accessRow().event as object), endDate: new Date("2027-06-11T00:00:00Z") } }),
      accessRow({ id: "g-inactive-account", adminUser: { name: "Léa Favre", email: "lea.favre@example.org", isActive: false, role: "front_desk" } }),
    ]) as never
    const rows = await loadFrontDeskAccesses({ adminUserId: "adm-colette", organizationId: "org-fete", now: NOW }, db)
    expect(rows.map((r) => r.accessId)).toEqual(["g-live", "g-late"])
    expect(rows[0]).toMatchObject({ eventId: "evt-fete", eventTitle: "Fête du village" })
  })

  it("returns none when the person has no grant at all", async () => {
    const rows = await loadFrontDeskAccesses({ adminUserId: "adm-colette", organizationId: "org-fete", now: NOW }, listReader([]) as never)
    expect(rows).toEqual([])
  })

  it("returns none without an account or an organisation, without querying", async () => {
    const findMany = vi.fn()
    const db = { adminEventAccess: { findMany } }
    expect(await loadFrontDeskAccesses({ adminUserId: "", organizationId: "org-fete", now: NOW }, db)).toEqual([])
    expect(await loadFrontDeskAccesses({ adminUserId: "adm-colette", organizationId: "", now: NOW }, db)).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })
})

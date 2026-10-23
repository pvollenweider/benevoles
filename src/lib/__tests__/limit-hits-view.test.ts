import { describe, it, expect } from "vitest"
import { groupLimitHits, heldText, limitHitWhen, limitLabel, PLATFORM_LABEL, queueStatusText, refusedText, zoneSentence, type LimitHitRow } from "../limit-hits-view"

// #1100: what the super admin reads about the sending limits reached.
const row = (o: Partial<LimitHitRow>): LimitHitRow => ({
  id: "h1", organizationId: "org1", organization: { name: "Fête du village", slug: "fete" }, limit: "org_per_minute",
  heldCount: 0, refusedCount: 0, firstAt: new Date("2026-10-23T19:04:10Z"), lastAt: new Date("2026-10-23T19:05:30Z"), ...o,
})

describe("limit hits view", () => {
  it("names each limit in plain French, an unknown one as is", () => {
    expect(limitLabel("org_per_minute")).toBe("Plafond par minute de l'organisation")
    expect(limitLabel("signup_per_hour")).toMatch(/inscription/)
    expect(limitLabel("new_limit")).toBe("Plafond new_limit")
  })

  it("counts held and refused emails apart, and says nothing for zero", () => {
    expect(heldText(1)).toBe("1 email retenu")
    expect(heldText(120)).toBe("120 emails retenus")
    expect(heldText(0)).toBeNull()
    expect(refusedText(1)).toBe("1 refusé")
    expect(refusedText(2)).toBe("2 refusés")
    expect(refusedText(0)).toBeNull()
  })

  it("says whether held emails still wait, never that they all left", () => {
    expect(queueStatusText(0)).toBe("Plus aucun email retenu en attente")
    expect(queueStatusText(1)).toBe("1 email retenu encore en attente")
    expect(queueStatusText(4)).toBe("4 emails retenus encore en attente")
  })

  it("gives the time in the zone, a range only when it lasted", () => {
    const tz = "Europe/Zurich"
    expect(limitHitWhen(new Date("2026-10-23T19:04:10Z"), new Date("2026-10-23T19:04:50Z"), tz)).toBe("23 oct. à 21:04")
    expect(limitHitWhen(new Date("2026-10-23T19:04:10Z"), new Date("2026-10-23T19:17:00Z"), tz)).toBe("23 oct. de 21:04 à 21:17")
    expect(limitHitWhen(new Date("2026-10-23T21:58:00Z"), new Date("2026-10-23T22:01:00Z"), tz)).toBe("du 23 oct. à 23:58 au 24 oct. à 00:01")
    expect(zoneSentence(tz)).toBe("Heures de Zurich.")
    expect(zoneSentence("America/New_York")).toBe("Heures de New York.")
  })

  it("groups by organisation, the latest first, with its queue state and platform emails apart", () => {
    const groups = groupLimitHits([
      row({ id: "a", heldCount: 1, lastAt: new Date("2026-10-22T19:05:00Z"), firstAt: new Date("2026-10-22T19:04:00Z") }),
      row({ id: "b", organizationId: null, organization: null, limit: "signup_per_hour", refusedCount: 3, lastAt: new Date("2026-10-23T08:00:00Z"), firstAt: new Date("2026-10-23T08:00:00Z") }),
      row({ id: "c", limit: "org_per_day", refusedCount: 2, lastAt: new Date("2026-10-23T10:00:00Z"), firstAt: new Date("2026-10-23T09:00:00Z") }),
    ], { org1: 4 }, "Europe/Zurich")
    expect(groups.map((g) => g.key)).toEqual(["org1", "platform"])
    expect(groups[0]).toMatchObject({ name: "Fête du village", slug: "fete", stillHeld: 4, queueStatus: "4 emails retenus encore en attente", refusedTotal: 2 })
    expect(groups[0].hits.map((h) => [h.id, h.held, h.refused])).toEqual([["c", null, "2 refusés"], ["a", "1 email retenu", null]])
    expect(groups[0].hits[0].firstAt).toBe("2026-10-23T09:00:00.000Z")
    // Only refused emails: nothing was queued, so nothing is said about the queue.
    expect(groups[1]).toMatchObject({ name: PLATFORM_LABEL, slug: null, stillHeld: 0, queueStatus: null })
  })

  it("says the queue is empty once held emails no longer wait", () => {
    const [g] = groupLimitHits([row({ heldCount: 2 })], {}, "Europe/Zurich")
    expect(g.queueStatus).toBe("Plus aucun email retenu en attente")
  })
})

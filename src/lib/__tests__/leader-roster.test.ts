import { describe, it, expect } from "vitest"
import { leaderRosterByPoste, leaderRosterCount, leaderRosterDays } from "@/lib/leader-roster"

// #1169: a sector leader's roster, grouped by poste, with a day filter.
const reg = (first: string, roleName: string, date: string, label = roleName, startTime = "08:00") => ({
  id: `${first}-${roleName}-${date}-${startTime}`,
  volunteer: { firstName: first, lastName: "M", email: `${first.toLowerCase()}@example.org` },
  shift: { roleName, label, date: `${date}T00:00:00.000Z`, startTime, endTime: "12:00" },
})

describe("leader roster (#1169)", () => {
  const rows = [
    reg("Ana", "Parking Nord", "2030-06-01"),
    reg("Ana", "Parking Sud", "2030-06-02"),
    reg("Ben", "Parking Nord", "2030-06-01", "Parking Nord", "14:00"),
  ]

  it("groups by poste in the scope's order, empty postes kept, shifts in order", () => {
    const out = leaderRosterByPoste(["École", "Parking Nord", "Parking Sud"], rows)
    expect(out.map((p) => [p.roleName, p.shifts.length])).toEqual([["École", 0], ["Parking Nord", 2], ["Parking Sud", 1]])
    expect(out[1].shifts.map((s) => s.startTime)).toEqual(["08:00", "14:00"])
  })

  it("B05: never shows nor counts a poste outside the scope", () => {
    const out = leaderRosterByPoste(["Parking Nord"], [...rows, reg("Zoé", "Bar", "2030-06-01")])
    expect(out.map((p) => p.roleName)).toEqual(["Parking Nord"])
    expect(out.flatMap((p) => p.shifts.flatMap((s) => s.registrations)).some((r) => r.shift.roleName === "Bar")).toBe(false)
  })

  it("counts people, not registrations: Ana on two postes counts once", () => {
    expect(leaderRosterCount(rows)).toBe(2)
    expect(leaderRosterCount([])).toBe(0)
  })

  it("lists the days with a sign-up or a shift below its minimum, sorted", () => {
    expect(leaderRosterDays(rows, [{ date: "2030-05-31T00:00:00.000Z" }])).toEqual(["2030-05-31", "2030-06-01", "2030-06-02"])
  })
})

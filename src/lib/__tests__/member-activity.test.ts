import { describe, it, expect } from "vitest"
import { activitySummary, memberTimeline, type ActivitySources } from "../member-activity"

// Member activity (#488): facts only, newest first.
const ev = { id: "e1", title: "Fête 2026" }
const d = (s: string) => new Date(s)
const sources: ActivitySources = {
  invites: [{ sentAt: d("2026-05-01T10:00:00Z"), usedAt: d("2026-05-02T10:00:00Z"), declinedAt: null, event: ev }],
  shiftDeclines: [],
  registrations: [
    { createdAt: d("2026-05-02T10:05:00Z"), updatedAt: d("2026-05-02T10:05:00Z"), status: "active", checkedInAt: d("2026-07-04T09:55:00Z"), shift: { roleName: "Accueil", label: "Accueil", date: d("2026-07-04T00:00:00Z") }, event: ev },
    { createdAt: d("2026-05-03T10:00:00Z"), updatedAt: d("2026-06-01T10:00:00Z"), status: "cancelled", checkedInAt: null, shift: { roleName: "Bar", label: "Bar soir", date: d("2026-07-04T00:00:00Z") }, event: ev },
    { createdAt: d("2026-05-04T10:00:00Z"), updatedAt: d("2026-05-04T10:00:00Z"), status: "waiting", checkedInAt: null, shift: { roleName: "Loge", label: "Loge", date: d("2026-07-05T00:00:00Z") }, event: ev },
  ],
  leaders: [{ createdAt: d("2026-06-10T10:00:00Z"), roleName: "Accueil", event: ev }],
  orgLog: [{ createdAt: d("2026-03-01T10:00:00Z"), action: "member.created" }, { createdAt: d("2026-03-02T10:00:00Z"), action: "something.else" }],
}

describe("memberTimeline", () => {
  it("lists every fact with its event, newest first, and nothing invented", () => {
    const t = memberTimeline(sources)
    expect(t.map((f) => f.kind)).toEqual(["present", "leader", "cancelled", "waitlisted", "registered", "registered", "invite_used", "invited", "profile"])
    expect(t[0]).toMatchObject({ text: "Présent : Accueil (sam. 4 juillet)", eventTitle: "Fête 2026" })
    expect(t.find((f) => f.kind === "cancelled")?.text).toBe("Inscription annulée : Bar · Bar soir (sam. 4 juillet)")
    expect(t.at(-1)).toMatchObject({ kind: "profile", text: "Fiche créée" })
    expect(t.some((f) => f.text.includes("something"))).toBe(false)
  })
})

describe("memberTimeline, recorded absence (#1141)", () => {
  const reg = (over: object) => ({ createdAt: d("2026-05-02T10:05:00Z"), updatedAt: d("2026-05-02T10:05:00Z"), status: "active", checkedInAt: null, shift: { roleName: "Bar", label: "Bar soir", date: d("2026-07-04T00:00:00Z") }, event: ev, ...over })
  const only = (r: object): ActivitySources => ({ invites: [], shiftDeclines: [], leaders: [], orgLog: [], registrations: [r as ActivitySources["registrations"][number]] })

  it("shows « Absent » at the time the organizer recorded it, like « Présent »", () => {
    const t = memberTimeline(only(reg({ attendanceStatus: "absent", attendanceAt: d("2026-07-04T18:20:00Z") })))
    expect(t.map((f) => f.kind)).toEqual(["absent", "registered"])
    expect(t[0]).toMatchObject({ at: d("2026-07-04T18:20:00Z"), text: "Absent : Bar · Bar soir (sam. 4 juillet)", eventTitle: "Fête 2026" })
  })

  it("never infers an absence: an expected person, or a row read without the column, has no such fact", () => {
    expect(memberTimeline(only(reg({}))).map((f) => f.kind)).toEqual(["registered"])
    expect(memberTimeline(only(reg({ attendanceStatus: null, attendanceAt: null }))).map((f) => f.kind)).toEqual(["registered"])
  })

  it("a row with both a check-in and « absent » (rolling deployment) is « Présent » only", () => {
    const t = memberTimeline(only(reg({ checkedInAt: d("2026-07-04T18:25:00Z"), attendanceStatus: "absent", attendanceAt: d("2026-07-04T18:20:00Z") })))
    expect(t.map((f) => f.kind)).toEqual(["present", "registered"])
  })

  it("shows the arrival and the departure of someone who left before the end (#1141)", () => {
    const t = memberTimeline(only(reg({ checkedInAt: d("2026-07-04T18:10:00Z"), attendanceStatus: "left_early", attendanceAt: d("2026-07-04T19:40:00Z") })))
    expect(t.map((f) => f.kind)).toEqual(["left_early", "present", "registered"])
    expect(t[0]).toMatchObject({ at: d("2026-07-04T19:40:00Z"), text: "Parti avant la fin : Bar · Bar soir (sam. 4 juillet)" })
    expect(t[1]).toMatchObject({ at: d("2026-07-04T18:10:00Z"), text: "Présent : Bar · Bar soir (sam. 4 juillet)" })
  })

  it("an absence is not a check-in: the summary's count of presences leaves it out", () => {
    const s = only(reg({ attendanceStatus: "absent", attendanceAt: d("2026-07-04T18:20:00Z") }))
    expect(activitySummary(s)).toBe("1 événement avec une inscription confirmée, 0 présence pointée.")
  })
})

describe("memberTimeline — « Je ne peux pas » for one shift (#1303)", () => {
  it("adds a shift_declined fact for the shift, never for the event", () => {
    const withShiftDecline: ActivitySources = {
      ...sources,
      shiftDeclines: [{ declinedAt: d("2026-06-20T10:00:00Z"), shift: { roleName: "Bar", label: "Bar soir", date: d("2026-07-04T00:00:00Z") }, event: ev }],
    }
    const t = memberTimeline(withShiftDecline)
    expect(t.find((f) => f.kind === "shift_declined")).toMatchObject({ text: "A indiqué ne pas pouvoir : Bar · Bar soir (sam. 4 juillet)", eventTitle: "Fête 2026" })
    expect(t.some((f) => f.kind === "invite_declined")).toBe(false)
  })
})

describe("memberTimeline — decline (#558)", () => {
  it("adds an invite_declined fact when declinedAt is set", () => {
    const withDecline: ActivitySources = { ...sources, invites: [{ ...sources.invites[0], declinedAt: d("2026-05-05T10:00:00Z") }] }
    const t = memberTimeline(withDecline)
    expect(t.find((f) => f.kind === "invite_declined")).toMatchObject({ text: "A indiqué ne pas être disponible", eventTitle: "Fête 2026" })
  })

  it("has no decline fact once it was cleared by a later registration", () => {
    expect(memberTimeline(sources).some((f) => f.kind === "invite_declined")).toBe(false)
  })
})

describe("activitySummary", () => {
  it("counts events with a confirmed registration and check-ins, no score", () => {
    expect(activitySummary(sources)).toBe("1 événement avec une inscription confirmée, 1 présence pointée.")
  })
})

import { describe, it, expect } from "vitest"
import { activitySummary, memberTimeline, type ActivitySources } from "../member-activity"

// Member activity (#488): facts only, newest first.
const ev = { id: "e1", title: "Fête 2026" }
const d = (s: string) => new Date(s)
const sources: ActivitySources = {
  invites: [{ sentAt: d("2026-05-01T10:00:00Z"), usedAt: d("2026-05-02T10:00:00Z"), declinedAt: null, event: ev }],
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

import { describe, it, expect } from "vitest"
import { buildOrgPageData, orgCancelContactEmail, ORG_SCOPE_SENTENCE, orgRegistrationStatusLabel, type OrgPageRegistrationInput } from "../org-personal-page"

const TZ = "Europe/Zurich"
const NOW = new Date("2031-05-01T08:00:00Z") // 10:00 in Zurich

function reg(over: Partial<OrgPageRegistrationInput> & { id: string; status: string; date: string; title?: string; publicStatus?: string }): OrgPageRegistrationInput {
  const { date, title, publicStatus, ...rest } = over
  return {
    ...rest,
    waitingPosition: over.waitingPosition ?? null,
    waitingExpiresAt: over.waitingExpiresAt ?? null,
    event: {
      id: `e-${over.id}`,
      title: title ?? "Fête",
      slug: `fete-${over.id}`,
      publicStatus: publicStatus ?? "published",
      cancelDeadlineDays: over.event?.cancelDeadlineDays ?? null,
      cancelDeadlineHours: over.event?.cancelDeadlineHours ?? null,
    },
    shift: {
      id: `s-${over.id}`,
      roleName: "Bar",
      label: "Bar",
      date: new Date(`${date}T00:00:00Z`),
      startTime: "10:00",
      endTime: "12:00",
      ...over.shift,
    },
  }
}

const build = (registrations: OrgPageRegistrationInput[]) => buildOrgPageData({
  volunteer: { firstName: "Léa", lastName: "M", email: "lea@example.ch" },
  organization: { name: "Asso", slug: "asso", timeZone: TZ },
  registrations,
  now: NOW,
  timeZone: TZ,
  orgHomeUrl: "https://asso.example",
})

// Regression: a volunteer past the cancellation deadline was told to write to the platform's
// public contact address instead of the organisation, and did.
describe("orgCancelContactEmail", () => {
  it("is the organisation's reply address when it has one", () => {
    expect(orgCancelContactEmail("club@example.org", "reponses@example.net")).toBe("club@example.org")
    expect(orgCancelContactEmail("  club@example.org ", null)).toBe("club@example.org")
  })
  it("falls back to the instance's reply address, like the page of one event", () => {
    expect(orgCancelContactEmail(null, "reponses@example.net")).toBe("reponses@example.net")
    expect(orgCancelContactEmail("   ", "reponses@example.net")).toBe("reponses@example.net")
  })
  it("names no address when neither exists", () => {
    expect(orgCancelContactEmail(null, undefined)).toBeNull()
  })
})

describe("orgRegistrationStatusLabel", () => {
  it("names only the states a registration can have", () => {
    expect(orgRegistrationStatusLabel("active")).toBe("Confirmé")
    expect(orgRegistrationStatusLabel("waiting", 2)).toBe("Liste d'attente, position 2")
    expect(orgRegistrationStatusLabel("waiting")).toBe("Liste d'attente")
    expect(orgRegistrationStatusLabel("offered")).toBe("Place proposée")
    expect(orgRegistrationStatusLabel("requested")).toBe("Demande en attente de validation")
  })
})

describe("buildOrgPageData", () => {
  it("keeps upcoming live registrations only, across unpublished and archived events, in date order", () => {
    const data = build([
      reg({ id: "active-june", status: "active", date: "2031-06-02", title: "Festival", publicStatus: "unpublished" }),
      reg({ id: "waiting-may", status: "waiting", date: "2031-05-20", title: "Café", publicStatus: "archived", waitingPosition: 3 }),
      reg({ id: "past", status: "active", date: "2031-04-01" }),
      reg({ id: "cancelled", status: "cancelled", date: "2031-05-03" }),
      reg({ id: "offered-may", status: "offered", date: "2031-05-05", title: "Marché" }),
      reg({ id: "requested-may", status: "requested", date: "2031-05-10", title: "Montage" }),
    ])
    expect(data.registrations.map((r) => r.id)).toEqual(["offered-may", "requested-may", "waiting-may", "active-june"])
    expect(data.registrations.map((r) => r.event.publicStatus)).toContain("archived")
    expect(data.registrations.map((r) => r.event.publicStatus)).toContain("unpublished")
    expect(data.registrations.find((r) => r.id === "waiting-may")?.statusLabel).toBe("Liste d'attente, position 3")
  })

  it("highlights the first upcoming confirmed shift, not a waitlist or a request", () => {
    const data = build([
      reg({ id: "waiting", status: "waiting", date: "2031-05-02" }),
      reg({ id: "confirmed", status: "active", date: "2031-05-03" }),
      reg({ id: "later", status: "active", date: "2031-05-04" }),
    ])
    expect(data.nextId).toBe("confirmed")
  })

  it("applies each event's own deadline: a confirmed place past it cannot be cancelled, others still can", () => {
    const data = build([
      reg({ id: "late", status: "active", date: "2031-05-02", event: { cancelDeadlineDays: 2, cancelDeadlineHours: null } as never }),
      reg({ id: "waiting", status: "waiting", date: "2031-05-02", event: { cancelDeadlineDays: 2, cancelDeadlineHours: null } as never }),
    ])
    const late = data.registrations.find((r) => r.id === "late")!
    const waiting = data.registrations.find((r) => r.id === "waiting")!
    expect(late.selfCancel).toEqual({ allowed: false, reason: "deadline" })
    expect(waiting.selfCancel).toEqual({ allowed: true, deadline: null })
  })

  it("shows the next deadline when the event has one, as an instant", () => {
    const data = build([
      reg({ id: "deadline", status: "active", date: "2031-06-02", event: { cancelDeadlineDays: 2, cancelDeadlineHours: null } as never }),
    ])
    expect(data.registrations[0].selfCancel).toEqual({ allowed: true, deadline: new Date("2031-05-31T08:00:00Z").toISOString() })
  })

  it("carries the scope sentence with the organisation's name", () => {
    const data = build([])
    expect(data.registrations).toEqual([])
    expect(data.nextId).toBeNull()
    expect(data.scopeSentence).toBe(ORG_SCOPE_SENTENCE("Asso"))
    expect(data.scopeSentence).toContain("Ne le partage pas.")
  })
})

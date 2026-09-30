import { describe, it, expect } from "vitest"
import { COMMITTED_STATUSES, LIVE_STATUSES, OCCUPYING_STATUSES, planPlacement } from "../registration-capacity"
import { outcomeHeading, readOutcome, requestNotice } from "../signup-outcome"
import { recapShifts } from "../signup-recap"
import { waitlistLabel } from "../waitlist-copy"
import { attentionItems } from "../attention"
import { filterRegistrations } from "../registrations-list"
import { acceptRequestRecap, refuseRequestRecap } from "../action-recap"
import { render } from "../notifications/templates"

// Sign-up approval (#484).
describe("placement on a « Sur validation » shift", () => {
  const base = { capacity: 2, occupied: 0, waitlistEnabled: true, maxWaitingPosition: null }
  it("a free spot becomes a request, not a place", () => {
    expect(planPlacement({ ...base, requiresApproval: true })).toEqual({ status: "requested" })
    expect(planPlacement(base)).toEqual({ status: "active" })
  })
  it("requests fill the shift like places: then the waitlist, or full", () => {
    expect(planPlacement({ ...base, occupied: 2, requiresApproval: true })).toEqual({ status: "waiting", waitingPosition: 1 })
    expect(planPlacement({ ...base, occupied: 2, waitlistEnabled: false, requiresApproval: true })).toEqual({ status: "full" })
  })
  it("a request holds a spot, is live (one per person and shift) and counts for overlaps; the waitlist doesn't", () => {
    expect(OCCUPYING_STATUSES).toContain("requested")
    expect(LIVE_STATUSES).toContain("requested")
    expect([...COMMITTED_STATUSES]).toEqual(["active", "requested"])
  })
})

describe("what the volunteer reads", () => {
  it("success page: a request never reads like a confirmed place", () => {
    const only = readOutcome(new URLSearchParams("requested=1&active=0"))
    expect(outcomeHeading(only)).toBe("Demande envoyée")
    expect(requestNotice(only)).toContain("pas encore une inscription confirmée")
    const mixed = readOutcome(new URLSearchParams("requested=2&active=1"))
    expect(outcomeHeading(mixed)).toBe("Inscription confirmée !")
    expect(requestNotice(mixed)).toMatch(/^2 de tes créneaux sont sur validation/)
    expect(requestNotice(readOutcome(new URLSearchParams("")))).toBeNull()
    expect(readOutcome(new URLSearchParams("requested=abc")).requested).toBe(0)
  })
  it("recap: « Sur validation », unless the shift is full and it's the waitlist", () => {
    const shift = { id: "s", roleName: "Chauffeur", label: "Chauffeur", date: "2026-07-04", startTime: "08:00", endTime: "12:00", waitlistEnabled: true, minAge: null, requiresApproval: true }
    expect(recapShifts([{ ...shift, status: "open" }])[0]).toMatchObject({ request: true, waitlist: false })
    expect(recapShifts([{ ...shift, status: "full" }])[0]).toMatchObject({ request: false, waitlist: true })
  })
  it("personal page labels the request in words", () => {
    expect(waitlistLabel({ status: "requested" })).toBe("Demande envoyée · en attente de réponse")
  })
  it("emails: the request says it's not confirmed yet; a refusal gives no reason unless written, escaped", () => {
    const req = render({ kind: "registration_requested", recipient: { email: "a@b.c" }, data: { volunteerName: "Marc D", eventTitle: "Fête", shifts: [{ label: "Navette", date: "04.07.2026", startTime: "08:00", endTime: "12:00" }], editToken: "tok", orgSlug: "asso" } })
    expect(req.subject).toBe("Demande reçue — Fête")
    expect(req.text).toContain("ce n'est pas encore une inscription confirmée")
    expect(req.text).toContain("/my/tok")
    const data = { volunteerName: "Marc D", eventTitle: "Fête", shiftLabel: "Navette", orgSlug: "asso", eventSlug: "fete" }
    const bare = render({ kind: "registration_refused", recipient: { email: "a@b.c" }, data })
    expect(bare.text).not.toContain("Message de l'organisation")
    const noted = render({ kind: "registration_refused", recipient: { email: "a@b.c" }, data: { ...data, note: "<b>Permis</b> requis" } })
    expect(noted.text).toContain("<b>Permis</b> requis")
    expect(noted.html).toContain("&lt;b&gt;Permis&lt;/b&gt; requis")
  })
})

describe("what the organizer sees", () => {
  it("attention list: pending requests, first, linking to the filtered list", () => {
    const now = new Date("2026-06-01T10:00:00Z")
    const items = attentionItems({
      now,
      offers: [],
      events: [{ id: "e1", title: "Fête", startDate: new Date("2026-07-04"), endDate: new Date("2026-07-05"), shifts: [], leaderRoles: [], overdueMilestones: 0, unansweredInvites: 0, pendingRequests: 2 }],
    })
    expect(items[0]).toMatchObject({ id: "requests:e1", severity: "high", href: "/admin/events/e1/registrations?demandes=1" })
    expect(items[0].message).toContain("2 demandes d'inscription attendent")
  })
  it("« Demandes à traiter » keeps only the requests", () => {
    const shift = { id: "s", roleName: "R", label: "R", date: "2026-07-04", startTime: "08:00", endTime: "12:00", capacity: 2, registrationCount: 1 }
    const rows = [
      { status: "active", shift, volunteer: { id: "v1", firstName: "A", lastName: "A", email: null } },
      { status: "requested", shift, volunteer: { id: "v2", firstName: "B", lastName: "B", email: null } },
    ]
    expect(filterRegistrations(rows, { search: "", role: "", shiftId: "", requestsOnly: true }).map((r) => r.volunteer.id)).toEqual(["v2"])
    expect(filterRegistrations(rows, { search: "", role: "", shiftId: "" })).toHaveLength(2)
  })
  it("decision recaps name the person and the shift, refusal as a danger", () => {
    expect(acceptRequestRecap({ name: "Marc D", shift: "Navette", hasEmail: true })).toMatchObject({ title: "Accepter la demande de Marc D ?", danger: false })
    const r = refuseRequestRecap({ name: "Marc D", shift: "Navette", hasEmail: true, waitlist: true })
    expect(r.danger).toBe(true)
    expect(r.lines.join(" ")).toContain("liste d'attente")
  })
})

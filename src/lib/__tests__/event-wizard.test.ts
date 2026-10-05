import { describe, it, expect } from "vitest"
import { canPublish, hasUpcomingShift, practicalInfoGaps, reviewChecks, wizardHrefs, WIZARD_STEPS, type ReviewFacts } from "../event-wizard"
import { staffingSummary, type StaffingShift } from "../staffing"

const facts: ReviewFacts = {
  id: "evt-1", title: "Fête", startDate: "2026-07-04", endDate: "2026-07-05", location: "Place du village",
  confirmationMessage: "Merci !", publicInstructions: null, publicStatus: "draft",
  shiftCount: 6, roleCount: 2, capacity: 14, leaderCount: 0,
}

describe("event wizard", () => {
  it("has three steps and knows where each one lives", () => {
    expect(WIZARD_STEPS.map((s) => s.label)).toEqual(["Informations", "Postes et créneaux", "Vérification et publication"])
    expect(wizardHrefs(null)[1]).toBe("/admin/events/new")
    expect(wizardHrefs("e")[1]).toBe("/admin/events/e/edit?wizard=1")
    expect(wizardHrefs("e")[2]).toBe("/admin/events/e/shifts?wizard=1")
    expect(wizardHrefs("e")[3]).toBe("/admin/events/e/review")
    expect(wizardHrefs("e").exit).toBe("/admin/events/e")
  })

  it("lists the required checks first and words them from the facts", () => {
    const checks = reviewChecks(facts)
    expect(checks.map((c) => [c.id, c.ok, c.required])).toEqual([
      ["dates", true, true], ["shifts", true, true], ["location", true, false], ["confirmation", true, false], ["instructions", false, false], ["leaders", false, false],
    ])
    expect(checks[0].label).toBe("Dates : 2 jours à partir du 4 juillet 2026")
    expect(checks[1].label).toBe("6 créneaux, 2 postes, 14 places")
    expect(checks[2].label).toBe("Lieu : Place du village")
    expect(canPublish(checks)).toBe(true)
  })

  it("blocks publication without shifts, not without optional details", () => {
    const checks = reviewChecks({ ...facts, shiftCount: 0, roleCount: 0, capacity: 0, location: null, confirmationMessage: null })
    expect(checks[1].label).toBe("Aucun créneau")
    expect(checks[1].hint).toMatch(/rien à choisir/)
    expect(canPublish(checks)).toBe(false)
    expect(canPublish(reviewChecks({ ...facts, location: null, confirmationMessage: null }))).toBe(true)
  })
})

// #565: non-blocking items for practical info, the registration window, reminders and coverage.
const TZ = "Europe/Zurich"
const NOW = new Date("2026-06-01T10:00:00Z") // 12:00 in Zurich
const check = (f: Partial<ReviewFacts>, id: string) => reviewChecks({ ...facts, ...f }).find((c) => c.id === id)
const allOn = { j2: true, j1: true, dd: true }

describe("practicalInfoGaps", () => {
  const withPlace = { locationDetails: "Entrée B", contactName: null, contactPhone: null }
  const withContact = { locationDetails: null, contactName: "Léa", contactPhone: null }
  const complete = { locationDetails: "Entrée B", contactName: null, contactPhone: "079 000 00 00" }
  const bare = { locationDetails: "  ", contactName: "", contactPhone: null }

  it("counts what each shift lacks, without an event place", () => {
    expect(practicalInfoGaps([withPlace, withContact, complete, bare], { location: null })).toEqual({
      shifts: 4, noPlace: 2, noContact: 2, noPlaceNorContact: 1, incomplete: 3,
    })
  })

  it("lets the event's place, text or coordinates, stand for every shift's place, never for the contact", () => {
    expect(practicalInfoGaps([bare, withContact], { location: "Salle communale" })).toMatchObject({ noPlace: 0, noContact: 1, incomplete: 1 })
    expect(practicalInfoGaps([bare], { location: null, latitude: 46.5, longitude: 6.6 })).toMatchObject({ noPlace: 0, noContact: 1 })
  })

  it("takes a shift's own coordinates as its place", () => {
    expect(practicalInfoGaps([{ ...bare, latitude: 46.5, longitude: 6.6 }], { location: null })).toMatchObject({ noPlace: 0, noPlaceNorContact: 0 })
  })
})

describe("hasUpcomingShift", () => {
  it("compares the shift's local start with now, in the organization's zone", () => {
    expect(hasUpcomingShift([{ date: "2026-06-01", startTime: "12:30" }], NOW, TZ)).toBe(true)
    expect(hasUpcomingShift([{ date: "2026-06-01", startTime: "11:30" }], NOW, TZ)).toBe(false)
    expect(hasUpcomingShift([{ date: "2026-05-31", startTime: "23:00" }, { date: "2026-06-02", startTime: "08:00" }], NOW, TZ)).toBe(true)
    expect(hasUpcomingShift([], NOW, TZ)).toBe(false)
  })
})

describe("review: practical info item", () => {
  const gaps = (g: Partial<NonNullable<ReviewFacts["practicalInfo"]>>) => ({ shifts: 6, noPlace: 0, noContact: 0, noPlaceNorContact: 0, incomplete: 0, ...g })

  it("is absent without the facts or without shifts", () => {
    expect(check({}, "practical-info")).toBeUndefined()
    expect(check({ practicalInfo: gaps({ shifts: 0 }) }, "practical-info")).toBeUndefined()
  })

  it("says done when every shift has a place and a contact", () => {
    expect(check({ practicalInfo: gaps({}) }, "practical-info")!.warn).toBeFalsy()
    expect(check({ practicalInfo: gaps({}) }, "practical-info")).toMatchObject({ ok: true, required: false, label: "Lieu et contact indiqués pour chaque créneau", href: "/admin/events/evt-1/shifts" })
  })

  it("words what is missing, with the count and where to fix it", () => {
    const both = check({ practicalInfo: gaps({ noPlace: 3, noContact: 3, noPlaceNorContact: 3, incomplete: 3 }) }, "practical-info")!
    expect(both).toMatchObject({ ok: false, required: false, warn: true, label: "3 créneaux sans lieu ni contact", href: "/admin/events/evt-1/shifts" })
    expect(both.hint).toMatch(/email de confirmation, les rappels et la page personnelle/)
    expect(check({ practicalInfo: gaps({ noContact: 1, incomplete: 1 }) }, "practical-info")!.label).toBe("1 créneau sans contact")
    expect(check({ practicalInfo: gaps({ noPlace: 2, incomplete: 2 }) }, "practical-info")!.label).toBe("2 créneaux sans lieu de rendez-vous")
    expect(check({ practicalInfo: gaps({ noPlace: 1, noContact: 2, incomplete: 3 }) }, "practical-info")!.label).toBe("3 créneaux sans lieu ou sans contact")
  })
})

describe("review: registration item", () => {
  const reg = (r: Partial<NonNullable<ReviewFacts["registration"]>>) => ({ registrationsOpen: true, opensAt: null, closesAt: null, timeZone: TZ, now: NOW, ...r })

  it("is absent without the facts and for an archived event", () => {
    expect(check({}, "registration")).toBeUndefined()
    expect(check({ publicStatus: "archived", registration: reg({}) }, "registration")).toBeUndefined()
  })

  it("says open, from publication for a draft, with the closing moment in the organization's zone", () => {
    expect(check({ registration: reg({}) }, "registration")).toMatchObject({ ok: true, label: "Inscriptions ouvertes dès la publication", href: "/admin/events/evt-1/edit#event-registrations-open", action: "Modifier" })
    expect(check({ publicStatus: "published", registration: reg({ closesAt: new Date("2026-06-30T21:59:00Z") }) }, "registration")!.label)
      .toBe("Inscriptions ouvertes jusqu'au mardi 30 juin à 23h59")
  })

  it("gives the opening date when it is scheduled", () => {
    expect(check({ registration: reg({ opensAt: new Date("2026-06-06T16:00:00Z") }) }, "registration"))
      .toMatchObject({ ok: true, label: "Ouverture des inscriptions le samedi 6 juin à 18h" })
    expect(check({ registration: reg({}) }, "registration")!.warn).toBeFalsy()
  })

  it("flags closed registrations without an opening date, and explains why", () => {
    const draft = check({ registration: reg({ registrationsOpen: false }) }, "registration")!
    expect(draft).toMatchObject({ ok: false, required: false, warn: true, label: "Inscriptions fermées, sans date d'ouverture" })
    expect(draft.hint).toMatch(/Une fois l'événement publié/)
    expect(check({ publicStatus: "published", registration: reg({ registrationsOpen: false }) }, "registration")!.hint).toMatch(/ne peuvent pas s'inscrire/)
    // A scheduled opening does nothing while the box is unchecked.
    expect(check({ registration: reg({ registrationsOpen: false, opensAt: new Date("2026-06-06T16:00:00Z") }) }, "registration")!.hint)
      .toBe("L'ouverture programmée du samedi 6 juin à 18h ne prend effet que si la case « Inscriptions ouvertes » est cochée.")
  })

  it("flags a closing moment already past", () => {
    const ended = check({ registration: reg({ closesAt: new Date("2026-05-31T21:59:00Z") }) }, "registration")!
    expect(ended).toMatchObject({ ok: false, warn: true, label: "Inscriptions fermées depuis le dimanche 31 mai à 23h59" })
    expect(ended.hint).toMatch(/plus personne ne peut s'inscrire/)
  })
})

describe("review: reminders item", () => {
  const rem = (r: Partial<NonNullable<ReviewFacts["reminders"]>>) => ({ eventEnabled: true, organization: allOn, upcomingShifts: true, ...r })

  it("is absent without a shift still to come, without the facts, or for an archived event", () => {
    expect(check({}, "reminders")).toBeUndefined()
    expect(check({ reminders: rem({ upcomingShifts: false }) }, "reminders")).toBeUndefined()
    expect(check({ publicStatus: "archived", reminders: rem({}) }, "reminders")).toBeUndefined()
  })

  it("says on, with a link to the organization's settings", () => {
    expect(check({ reminders: rem({}) }, "reminders")!.warn).toBeFalsy()
    expect(check({ reminders: rem({}) }, "reminders")).toMatchObject({ ok: true, label: "Rappels automatiques J-2, J-1 et du jour activés", href: "/admin/settings/notifications", action: "Réglages des emails" })
  })

  it("names the reminders left when the organization switched some off", () => {
    const partly = check({ reminders: rem({ organization: { j2: true, j1: false, dd: true } }) }, "reminders")!
    expect(partly).toMatchObject({ ok: false, required: false, warn: true, label: "Rappels automatiques en partie désactivés pour l'organisation", href: "/admin/settings/notifications" })
    expect(partly.hint).toBe("Seuls partent : Rappel J-2, Rappel du jour.")
  })

  it("says none go out when the organization switched them all off", () => {
    expect(check({ reminders: rem({ organization: { j2: false, j1: false, dd: false } }) }, "reminders"))
      .toMatchObject({ ok: false, warn: true, label: "Aucun rappel automatique : désactivés pour l'organisation", href: "/admin/settings/notifications" })
  })

  it("says when they are off for this event, which wins, with a link to the box in the event form", () => {
    const off = check({ reminders: rem({ eventEnabled: false, organization: { j2: false, j1: true, dd: true } }) }, "reminders")!
    expect(off).toMatchObject({ ok: false, warn: true, label: "Rappels automatiques coupés pour cet événement" })
    expect(off).toMatchObject({ href: "/admin/events/evt-1/edit#event-reminders", action: "Modifier" })
    expect(off.hint).toBe("Aucun rappel J-2, J-1 ni du jour ne part pour cet événement, quels que soient les réglages de l'organisation.")
    expect(off.hint).not.toMatch(/interface/)
  })
})

describe("review: coverage item", () => {
  const shift = (s: Partial<StaffingShift>): StaffingShift => ({ id: "s", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 4, active: 4, waiting: 0, closed: false, ...s })
  const full = staffingSummary([shift({ id: "a" }), shift({ id: "b" })], [])
  const partial = staffingSummary([shift({ id: "a", active: 1 }), shift({ id: "b", active: 2 }), shift({ id: "c" }), shift({ id: "d", active: 0, closed: true })], [])

  it("only appears once the event is published, with shifts", () => {
    expect(check({ coverage: partial }, "coverage")).toBeUndefined()
    expect(check({ publicStatus: "published" }, "coverage")).toBeUndefined()
    expect(check({ publicStatus: "published", coverage: staffingSummary([], []) }, "coverage")).toBeUndefined()
  })

  it("reuses the staffing totals and links to the staffing page", () => {
    expect(check({ publicStatus: "published", coverage: partial }, "coverage")).toMatchObject({
      ok: false, required: false, warn: true, label: "7 places occupées sur 16, 2 créneaux incomplets", href: "/admin/events/evt-1/staffing", action: "Voir les créneaux incomplets",
    })
    expect(check({ publicStatus: "published", coverage: full }, "coverage")).toMatchObject({ ok: true, warn: false, label: "8 places occupées sur 8, aucun créneau incomplet" })
    const one = staffingSummary([shift({ active: 1, capacity: 2 })], [])
    expect(check({ publicStatus: "published", coverage: one }, "coverage")!.label).toBe("1 place occupée sur 2, 1 créneau incomplet")
  })
})

describe("review: the new items never block", () => {
  it("publishes with every new item in its worst state", () => {
    const checks = reviewChecks({
      ...facts,
      practicalInfo: { shifts: 6, noPlace: 6, noContact: 6, noPlaceNorContact: 6, incomplete: 6 },
      registration: { registrationsOpen: false, opensAt: null, closesAt: null, timeZone: TZ, now: NOW },
      reminders: { eventEnabled: false, organization: allOn, upcomingShifts: true },
    })
    expect(checks.map((c) => c.id)).toEqual(["dates", "shifts", "location", "confirmation", "instructions", "leaders", "practical-info", "registration", "reminders"])
    expect(checks.slice(6).every((c) => !c.ok && !c.required && c.warn)).toBe(true)
    // The old optional fields stay « Facultatif », not « À vérifier ».
    expect(checks.slice(2, 6).some((c) => c.warn)).toBe(false)
    expect(canPublish(checks)).toBe(true)
  })
})

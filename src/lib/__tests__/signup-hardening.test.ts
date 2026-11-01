import { describe, it, expect } from "vitest"
import { shiftHasEnded, endedShift } from "../shift-ended"
import { pastShiftRefusal, busySignupRefusal } from "../signup-eligibility"
import { barText, shiftListText, shiftViewState, type TimelineShift } from "../public-timeline"
import { hasAvailableShift, isShiftSelectable, noAvailableShiftText, type SignupShift } from "../public-signup"
import { overlapConflict, signupConflictReason } from "../signup-conflict"
import { isSignupContention } from "../registration-capacity"
import { render } from "../notifications/templates"
import { swapRefusalMessage } from "../shift-swaps"

const ZH = "Europe/Zurich"
const day = (d: string) => new Date(`${d}T00:00:00Z`)

// AUTHZ-02: a shift that is over is refused for every event, at the minute, in the organisation's
// time zone; one that has started and still runs can be taken.
describe("a shift that is over", () => {
  const bar = { date: day("2026-07-04"), startTime: "10:00", endTime: "12:00", label: "Bar" }

  it("is refused on a short event the day after", () => {
    expect(pastShiftRefusal([bar], new Date("2026-07-05T08:00:00Z"), ZH)).toEqual({ status: 409, body: { error: 'Le créneau "Bar" est terminé. Recharge la page.' } })
  })

  it("is refused the same day, once its end has passed (12:00 in Zurich is 10:00 UTC in summer)", () => {
    expect(pastShiftRefusal([bar], new Date("2026-07-04T09:59:00Z"), ZH)).toBeNull()
    expect(pastShiftRefusal([bar], new Date("2026-07-04T10:00:00Z"), ZH)).not.toBeNull()
    expect(pastShiftRefusal([bar], new Date("2026-07-04T11:00:00Z"), ZH)).not.toBeNull()
  })

  it("is not refused while it runs", () => {
    expect(pastShiftRefusal([bar], new Date("2026-07-04T08:30:00Z"), ZH)).toBeNull()
  })

  it("counts a night shift until its end the next morning", () => {
    const night = { date: day("2026-07-04"), startTime: "22:00", endTime: "02:00", label: "Nuit" }
    // 01:30 on the 5th in Zurich, still running.
    expect(shiftHasEnded(night, new Date("2026-07-04T23:30:00Z"), ZH)).toBe(false)
    // 02:00 on the 5th in Zurich.
    expect(shiftHasEnded(night, new Date("2026-07-05T00:00:00Z"), ZH)).toBe(true)
    // An end at midnight sharp belongs to the next day.
    const evening = { date: day("2026-07-04"), startTime: "18:00", endTime: "00:00", label: "Soir" }
    expect(shiftHasEnded(evening, new Date("2026-07-04T21:59:00Z"), ZH)).toBe(false)
    expect(shiftHasEnded(evening, new Date("2026-07-04T22:00:00Z"), ZH)).toBe(true)
  })

  it("reads the real hour on the days the clock changes", () => {
    // Spring forward, 29 March 2026: 01:00–04:00 local is 00:00–01:00 UTC.
    const spring = { date: day("2026-03-29"), startTime: "01:00", endTime: "04:00" }
    expect(shiftHasEnded(spring, new Date("2026-03-29T01:59:00Z"), ZH)).toBe(false)
    expect(shiftHasEnded(spring, new Date("2026-03-29T02:00:00Z"), ZH)).toBe(true)
    // Fall back, 25 October 2026: a night shift 22:00–06:00 lasts nine hours, ends 05:00 UTC.
    const autumn = { date: day("2026-10-24"), startTime: "22:00", endTime: "06:00" }
    expect(shiftHasEnded(autumn, new Date("2026-10-25T04:59:00Z"), ZH)).toBe(false)
    expect(shiftHasEnded(autumn, new Date("2026-10-25T05:00:00Z"), ZH)).toBe(true)
  })

  it("follows the organisation's zone, not the server's", () => {
    const ny = { date: day("2026-07-04"), startTime: "10:00", endTime: "12:00" }
    // 12:00 in New York is 16:00 UTC.
    expect(shiftHasEnded(ny, new Date("2026-07-04T15:59:00Z"), "America/New_York")).toBe(false)
    expect(shiftHasEnded(ny, new Date("2026-07-04T16:00:00Z"), "America/New_York")).toBe(true)
  })

  it("names the first shift that is over among several", () => {
    const later = { ...bar, date: day("2026-07-06"), label: "Caisse" }
    expect(endedShift([later, bar], new Date("2026-07-05T08:00:00Z"), ZH)?.label).toBe("Bar")
  })
})

describe("« Terminé » on the public schedule", () => {
  const shift = (over: Partial<TimelineShift> = {}): TimelineShift => ({
    id: "a", roleName: "Bar", label: "Bar", startTime: "10:00", endTime: "12:00", status: "ended", capacity: 5, registered: 2, spotsLeft: 3, ...over,
  })

  it("is never selectable, its name and list text say « Terminé »", () => {
    const view = shiftViewState({ shift: shift(), selected: false, conflict: false, reserved: false, locked: false })
    expect(view).toMatchObject({ ended: true, unavailable: true, clickable: false, look: "unavailable" })
    expect(barText({ shift: shift(), selected: false, reserved: false, locked: false }).ariaLabel).toBe("Terminé, Bar 10h–12h")
    expect(shiftListText(shift(), view, { locked: false }).status).toBe("Terminé")
    // Over and full: « Terminé », no waitlist to join.
    const fullEnded = shift({ waitlistEnabled: true })
    expect(shiftListText(fullEnded, shiftViewState({ shift: fullEnded, selected: false, conflict: false, reserved: false, locked: false }), { locked: false }).status).toBe("Terminé")
  })

  it("the list says « Terminé » before an overlap, like the bar", () => {
    const view = shiftViewState({ shift: shift(), selected: false, conflict: true, reserved: false, locked: false })
    expect(shiftListText(shift(), view, { locked: false }).status).toBe("Terminé")
  })

  it("a shift the visitor holds keeps its own state", () => {
    const view = shiftViewState({ shift: shift(), held: "active", selected: false, conflict: false, reserved: false, locked: false })
    expect(view.unavailable).toBe(false)
  })

  it("the page says when everything is over rather than full", () => {
    const s = (status: string): SignupShift => ({ id: status, label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", status, waitlistEnabled: true, minAge: null })
    expect(isShiftSelectable(s("ended"), new Set())).toBe(false)
    expect(hasAvailableShift([s("ended")])).toBe(false)
    expect(noAvailableShiftText([s("ended"), s("ended")], false)).toBe("Tous les créneaux sont terminés.")
    expect(noAvailableShiftText([s("ended")], true)).toBe("Tous les créneaux de ces postes sont terminés.")
    expect(noAvailableShiftText([s("ended"), { ...s("full"), waitlistEnabled: false }], false)).toBe("Tous les créneaux sont complets.")
  })
})

// AUTHZ-01: the reason goes to the owner of the address only, by email.
describe("the notice of a sign-up not recorded", () => {
  it("says why, naming the owner's own shifts", () => {
    expect(signupConflictReason({ kind: "duplicate", shift: "Bar" })).toBe("tu as déjà une inscription ou une place en liste d'attente pour « Bar »")
    expect(signupConflictReason({ kind: "duplicate", shift: null })).toContain("l'un de ces créneaux")
    expect(signupConflictReason({ kind: "role_limit", roleName: "Loge", max: 1 })).toBe("cette demande dépasserait la limite de 1 créneau pour le poste « Loge »")
    expect(signupConflictReason({ kind: "workload" })).toContain("pauses et limites de charge")
    const held = [{ shift: { label: "Accueil", date: day("2030-06-01"), startTime: "15:00", endTime: "17:00" } }]
    const asked = [{ label: "Bar", date: day("2030-06-01"), startTime: "14:00", endTime: "16:00" }]
    expect(overlapConflict(held, asked)).toEqual({ kind: "overlap", shift: "Bar", held: "Accueil" })
    expect(overlapConflict(held, [{ ...asked[0], startTime: "17:00", endTime: "18:00" }])).toBeNull()
  })

  const payload = (editToken: string | null) => ({
    kind: "registration_link_resend" as const,
    recipient: { email: "owner@example.org", name: "Camille Rochat" },
    data: { volunteerName: "Camille Rochat", eventTitle: "Fête <du> village", orgSlug: "club", editToken, notRecorded: { reason: "le créneau « Bar » chevauche ton créneau « Accueil »" } },
  })

  it("renders what was not recorded, the link if any, and reassures someone who did nothing", () => {
    const mail = render(payload("tok-1"))
    expect(mail.subject).toBe("Demande d'inscription non enregistrée — Fête <du> village")
    expect(mail.text).toContain("Elle n'a pas été enregistrée : le créneau « Bar » chevauche ton créneau « Accueil ».")
    expect(mail.text).toContain("/my/tok-1")
    expect(mail.text).toContain("Si ce n'était pas toi, tu n'as rien à faire : cette demande n'a rien changé.")
    expect(mail.html).toContain("Fête &lt;du&gt; village")
    expect(mail.html).not.toContain("<du>")
    const noLink = render(payload(null))
    expect(noLink.text).not.toContain("/my/")
    expect(noLink.text).toContain("choisis d'autres créneaux sur la page de l'événement")
  })

  it("leaves the usual link re-send unchanged", () => {
    const mail = render({ kind: "registration_link_resend", recipient: { email: "a@example.org" }, data: { volunteerName: "Ana Silva", eventTitle: "Fête", orgSlug: "club", editToken: "tok-2" } })
    expect(mail.subject).toBe("Ton lien pour gérer tes inscriptions — Fête")
    expect(mail.text).toContain("/my/tok-2")
  })
})

// AUTHZ-04: contention is a clean « réessaie », never a 500.
describe("contention on the sign-up's locks", () => {
  it("recognises Prisma's transaction timeout and Postgres lock, deadlock and serialization errors, wrapped or not", () => {
    expect(isSignupContention({ code: "P2028" })).toBe(true)
    expect(isSignupContention({ code: "P2034" })).toBe(true)
    expect(isSignupContention({ code: "P2010", meta: { code: "55P03" } })).toBe(true)
    expect(isSignupContention({ cause: { originalCode: "40P01" } })).toBe(true)
    expect(isSignupContention({ meta: { driverAdapterError: { cause: { originalCode: "40001" } } } })).toBe(true)
    expect(isSignupContention({ code: "P2002" })).toBe(false)
    expect(isSignupContention(new Error("boom"))).toBe(false)
    expect(isSignupContention(null)).toBe(false)
  })

  it("answers 409 busy, nothing recorded", () => {
    expect(busySignupRefusal()).toEqual({ status: 409, body: { error: "Plusieurs inscriptions sont en cours en même temps. Cette tentative n'a pas été enregistrée.", busy: true } })
  })
})

// AUTHZ-08: the requester's own situation is never told to the person offering.
describe("a swap offer the requester's side stops", () => {
  it("has one message, which says nothing of why", () => {
    expect(swapRefusalMessage("not_possible")).toBe("Cet échange n'est pas possible avec ce créneau. Propose un autre de tes créneaux.")
  })
})

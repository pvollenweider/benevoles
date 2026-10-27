import { describe, expect, it } from "vitest"
import {
  agreementTerms, beforeSwapDeadline, isLiveSwapStatus, materialTerms, needsSwapApproval, personSwapCheck, shiftMateriallyChanged,
  swapCompatibility, swapDeadline, swapRefusalMessage, type HeldRegistration, type SwapEndReason, type SwapRegistration, type SwapShift,
} from "../shift-swaps"
import { SWAP_REASON_LOG_LABELS } from "../log-value-labels"

const ZONE = "Europe/Zurich"

const shift = (over: Partial<SwapShift> = {}): SwapShift => ({
  id: "s1", eventId: "e1", roleName: "Bar", status: "open", date: new Date("2030-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00", ...over,
})
const reg = (over: Partial<SwapRegistration> = {}, s: Partial<SwapShift> = {}): SwapRegistration => ({
  id: "r1", volunteerId: "v1", eventId: "e1", status: "active", shift: shift(s), ...over,
})

const pierre = reg({ id: "rp", volunteerId: "vp" }, { id: "sa", startTime: "10:00", endTime: "12:00" })
const jean = reg({ id: "rj", volunteerId: "vj" }, { id: "sb", startTime: "14:00", endTime: "16:00" })
const none = { assignedOnlyRoles: new Set<string>() }

describe("swapCompatibility (#1174)", () => {
  it("accepts two confirmed registrations of two people on two shifts of the same poste (E01, E03)", () => {
    expect(swapCompatibility(pierre, jean, none)).toEqual({ ok: true })
  })

  it("refuses two different postes, even without sectors (E03)", () => {
    expect(swapCompatibility(pierre, { ...jean, shift: { ...jean.shift, roleName: "Accueil" } }, none)).toEqual({ ok: false, code: "other_poste" })
  })

  it("refuses a swap with oneself, the same registration or the same shift", () => {
    expect(swapCompatibility(pierre, { ...jean, volunteerId: "vp" }, none)).toEqual({ ok: false, code: "same_person" })
    expect(swapCompatibility(pierre, pierre, none)).toEqual({ ok: false, code: "same_registration" })
    expect(swapCompatibility(pierre, { ...jean, shift: { ...jean.shift, id: "sa" } }, none)).toEqual({ ok: false, code: "same_shift" })
  })

  it("refuses registrations of two events", () => {
    expect(swapCompatibility(pierre, { ...jean, eventId: "e2", shift: { ...jean.shift, eventId: "e2" } }, none)).toEqual({ ok: false, code: "other_event" })
  })

  it("only swaps confirmed places: no request, waitlist or offered place", () => {
    for (const status of ["requested", "waiting", "offered", "cancelled"]) {
      expect(swapCompatibility(pierre, { ...jean, status }, none)).toEqual({ ok: false, code: "not_confirmed" })
    }
  })

  it("refuses a cancelled shift", () => {
    expect(swapCompatibility(pierre, { ...jean, shift: { ...jean.shift, status: "cancelled" } }, none)).toEqual({ ok: false, code: "shift_cancelled" })
  })

  it("refuses a poste assigned by the organisation only (#1145), by its flag or by any shift of the role", () => {
    expect(swapCompatibility(pierre, { ...jean, shift: { ...jean.shift, assignedOnly: true } }, none)).toEqual({ ok: false, code: "assigned_only" })
    expect(swapCompatibility(pierre, jean, { assignedOnlyRoles: new Set(["Bar"]) })).toEqual({ ok: false, code: "assigned_only" })
  })
})

describe("personSwapCheck (#1174): the sign-up's rules on the plan without the shift given away", () => {
  const person = { active: true, tags: [] as string[], birthDate: new Date("1990-01-01") }
  const giving = { id: "rp" }
  const receiving = shift({ id: "sb", startTime: "14:00", endTime: "16:00" })
  const held = (list: Partial<HeldRegistration & { s: Partial<SwapShift> }>[]): HeldRegistration[] =>
    list.map((h, i) => ({ id: h.id ?? `h${i}`, status: h.status ?? "active", shift: shift(h.s ?? {}) }))
  const base = { person, giving, receiving, reserved: new Map<string, string[]>(), limits: new Map<string, number>() }

  it("accepts a plan where the new shift fits", () => {
    expect(personSwapCheck({ ...base, held: held([{ id: "rp", s: { id: "sa" } }]) })).toEqual({ ok: true })
  })

  it("ignores the shift given away for the overlap: swapping two overlapping shifts of the same person is fine", () => {
    const overlapping = shift({ id: "sb", startTime: "11:00", endTime: "13:00" })
    expect(personSwapCheck({ ...base, receiving: overlapping, held: held([{ id: "rp", s: { id: "sa" } }]) })).toEqual({ ok: true })
  })

  it("refuses an overlap with another confirmed shift or pending request, not with a waitlist entry (#986)", () => {
    const other = { id: "r2", s: { id: "sx", startTime: "15:00", endTime: "17:00", roleName: "Accueil" } }
    expect(personSwapCheck({ ...base, held: held([{ id: "rp", s: { id: "sa" } }, other]) })).toEqual({ ok: false, code: "overlap" })
    expect(personSwapCheck({ ...base, held: held([{ id: "rp", s: { id: "sa" } }, { ...other, status: "requested" }]) })).toEqual({ ok: false, code: "overlap" })
    expect(personSwapCheck({ ...base, held: held([{ id: "rp", s: { id: "sa" } }, { ...other, status: "waiting" }]) })).toEqual({ ok: true })
  })

  it("lets a cumulable role overlap (#986)", () => {
    const other = { id: "r2", s: { id: "sx", startTime: "15:00", endTime: "17:00", roleName: "Secours", overlapAllowed: true } }
    expect(personSwapCheck({ ...base, held: held([{ id: "rp", s: { id: "sa" } }, other]) })).toEqual({ ok: true })
  })

  it("refuses a second live registration on the shift received (unique index)", () => {
    expect(personSwapCheck({ ...base, held: held([{ id: "rp", s: { id: "sa" } }, { id: "r2", status: "waiting", s: { id: "sb", startTime: "14:00", endTime: "16:00" } }]) })).toEqual({ ok: false, code: "already_on_shift" })
  })

  it("applies the limit per volunteer on the plan without the given shift (#466)", () => {
    const limits = new Map([["Bar", 2]])
    const two = held([{ id: "rp", s: { id: "sa" } }, { id: "r2", s: { id: "sc", date: new Date("2030-07-05T00:00:00Z") } }])
    expect(personSwapCheck({ ...base, limits, held: two })).toEqual({ ok: true })
    const tooMany = held([{ id: "r3", s: { id: "sd", date: new Date("2030-07-06T00:00:00Z") } }, { id: "r2", s: { id: "sc", date: new Date("2030-07-05T00:00:00Z") } }])
    expect(personSwapCheck({ ...base, limits, held: tooMany })).toEqual({ ok: false, code: "role_limit" })
  })

  it("refuses a minimum age not reached or unknown, whatever an approval says (#192, E06)", () => {
    const adult = shift({ id: "sb", startTime: "14:00", endTime: "16:00", minAge: 18 })
    expect(personSwapCheck({ ...base, receiving: adult, held: [] })).toEqual({ ok: true })
    expect(personSwapCheck({ ...base, receiving: adult, person: { ...person, birthDate: new Date("2020-01-01") }, held: [] })).toEqual({ ok: false, code: "min_age" })
    expect(personSwapCheck({ ...base, receiving: adult, person: { ...person, birthDate: null }, held: [] })).toEqual({ ok: false, code: "min_age" })
  })

  it("refuses a poste reserved to tags the person does not have (#470)", () => {
    const reserved = new Map([["Bar", ["sécurité"]]])
    expect(personSwapCheck({ ...base, reserved, held: [] })).toEqual({ ok: false, code: "reserved" })
    expect(personSwapCheck({ ...base, reserved, person: { ...person, tags: ["Sécurité"] }, held: [] })).toEqual({ ok: true })
  })

  it("refuses an erased, merged or inactive person", () => {
    expect(personSwapCheck({ ...base, person: { ...person, erasedAt: new Date() }, held: [] })).toEqual({ ok: false, code: "volunteer_gone" })
    expect(personSwapCheck({ ...base, person: { ...person, mergedIntoId: "other" }, held: [] })).toEqual({ ok: false, code: "volunteer_gone" })
    expect(personSwapCheck({ ...base, person: { ...person, active: false }, held: [] })).toEqual({ ok: false, code: "volunteer_gone" })
  })
})

describe("swapDeadline (#1174, #946)", () => {
  const a = { date: new Date("2030-07-04T00:00:00Z"), startTime: "10:00" }
  const b = { date: new Date("2030-07-05T00:00:00Z"), startTime: "14:00" }
  const far = new Date("2031-01-01T00:00:00Z")

  it("is the start of the first of the two shifts by default, in the organisation's zone", () => {
    expect(swapDeadline({ expiresAt: far, given: [b, a], setting: null, timeZone: ZONE }).toISOString()).toBe("2030-07-04T08:00:00.000Z")
  })

  it("applies the event's self-cancellation deadline to each shift given away", () => {
    expect(swapDeadline({ expiresAt: far, given: [a, b], setting: { cancelDeadlineDays: 2 }, timeZone: ZONE }).toISOString()).toBe("2030-07-02T08:00:00.000Z")
  })

  it("is the request's own expiry when earlier", () => {
    const soon = new Date("2030-06-01T00:00:00Z")
    expect(swapDeadline({ expiresAt: soon, given: [a, b], setting: null, timeZone: ZONE })).toEqual(soon)
  })

  it("is strict: nothing happens at the deadline itself (E08)", () => {
    const deadline = new Date("2030-07-04T08:00:00Z")
    expect(beforeSwapDeadline(new Date("2030-07-04T07:59:59Z"), deadline)).toBe(true)
    expect(beforeSwapDeadline(deadline, deadline)).toBe(false)
  })
})

describe("needsSwapApproval (#1174 E04, E05)", () => {
  it("asks an organiser when either shift is « sur validation » or the event validates every swap", () => {
    expect(needsSwapApproval({}, {}, {})).toBe(false)
    expect(needsSwapApproval({ requiresApproval: true }, {}, {})).toBe(true)
    expect(needsSwapApproval({}, { requiresApproval: true }, {})).toBe(true)
    expect(needsSwapApproval({}, {}, { shiftSwapsApproval: true })).toBe(true)
  })
})

describe("materialTerms (#1174 E09, E13)", () => {
  it("changes with the time, the day, the place, the poste or the requirements", () => {
    const s = shift({ locationDetails: "Entrée nord", reservedTags: ["sécurité"] })
    for (const change of [
      { startTime: "11:00" }, { endTime: "13:00" }, { date: new Date("2030-07-05T00:00:00Z") }, { locationDetails: "Entrée sud" },
      { latitude: 46.2 }, { roleName: "Accueil" }, { minAge: 16 }, { reservedTags: ["secouriste"] }, { assignedOnly: true }, { status: "cancelled" }, { sectorId: "x" },
    ] as Partial<SwapShift>[]) {
      expect(shiftMateriallyChanged(s, { ...s, ...change })).toBe(true)
    }
  })

  it("keeps the agreement for a typo in the label, the instructions, the capacity or « sur validation »", () => {
    const s = shift({ reservedTags: ["Sécurité", "secouriste"] })
    expect(shiftMateriallyChanged(s, { ...s, requiresApproval: true, status: "full", reservedTags: ["secouriste", " sécurité "] })).toBe(false)
    expect(materialTerms({ ...s, ...({ label: "Bar du soir", capacity: 9 } as object) })).toBe(materialTerms(s))
  })

  it("binds the agreement to both shifts, in order", () => {
    expect(agreementTerms(pierre.shift, jean.shift)).not.toBe(agreementTerms(jean.shift, pierre.shift))
  })
})

describe("swap states and words", () => {
  it("knows the live states", () => {
    expect(["open", "offered", "approval"].every(isLiveSwapStatus)).toBe(true)
    expect(["applied", "withdrawn", "refused", "expired", "impossible", "cancelled"].some(isLiveSwapStatus)).toBe(false)
  })

  it("never names the other person's mission in a refusal", () => {
    expect(swapRefusalMessage("overlap")).toBe("Cet échange crée un conflit d'horaire.")
  })

  it("has a message and a log label for every reason", () => {
    for (const code of Object.keys(SWAP_REASON_LOG_LABELS) as SwapEndReason[]) {
      expect(swapRefusalMessage(code)).toMatch(/\.$/)
    }
  })
})

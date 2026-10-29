import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CONSENT_PRIVACY_HREF,
  EMPTY_SIGNUP_FORM,
  conflictingShiftIds,
  hasAvailableShift,
  isShiftSelectable,
  prefillContact,
  shiftsByDay,
  toMyRegistrations,
  validateSignup,
  type SignupShift,
  proposedShiftState,
  proposedShiftText,
} from "../public-signup"

const shift = (id: string, over: Partial<SignupShift> = {}): SignupShift => ({
  id, label: id, date: "2030-06-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00",
  status: "open", waitlistEnabled: false, minAge: null, ...over,
})

describe("isShiftSelectable", () => {
  it("open shift not yet mine: yes; closed, cancelled, missing: no", () => {
    expect(isShiftSelectable(shift("a"), new Set())).toBe(true)
    expect(isShiftSelectable(shift("a", { status: "closed" }), new Set())).toBe(false)
    expect(isShiftSelectable(shift("a", { status: "cancelled" }), new Set())).toBe(false)
    expect(isShiftSelectable(undefined, new Set())).toBe(false)
  })

  it("full shift only with a waitlist", () => {
    expect(isShiftSelectable(shift("a", { status: "full" }), new Set())).toBe(false)
    expect(isShiftSelectable(shift("a", { status: "full", waitlistEnabled: true }), new Set())).toBe(true)
  })

  it("not a shift I'm already registered on", () => {
    expect(isShiftSelectable(shift("a"), new Set(["a"]))).toBe(false)
  })
})

describe("conflictingShiftIds", () => {
  const a = shift("a", { startTime: "10:00", endTime: "12:00" })
  const b = shift("b", { startTime: "11:00", endTime: "13:00" })
  const c = shift("c", { startTime: "14:00", endTime: "16:00" })

  it("flags shifts overlapping a selected one, not the selected one itself", () => {
    expect(conflictingShiftIds([a, b, c], new Set(["a"]), new Set())).toEqual(new Set(["b"]))
  })

  it("also against shifts I'm already registered on", () => {
    expect(conflictingShiftIds([a, b, c], new Set(), new Set(["b"]))).toEqual(new Set(["a"]))
  })

  it("nothing selected, nothing flagged", () => {
    expect(conflictingShiftIds([a, b, c], new Set(), new Set())).toEqual(new Set())
  })
})

describe("hasAvailableShift / shiftsByDay", () => {
  it("available when any shift is open or full with a waitlist", () => {
    expect(hasAvailableShift([shift("a", { status: "full" }), shift("b", { status: "closed" })])).toBe(false)
    expect(hasAvailableShift([shift("a", { status: "full", waitlistEnabled: true })])).toBe(true)
    expect(hasAvailableShift([shift("a")])).toBe(true)
  })

  it("groups by day, keeping order", () => {
    const grouped = shiftsByDay([shift("a"), shift("b", { date: "2030-06-02T00:00:00.000Z" }), shift("c")])
    expect(Object.keys(grouped)).toEqual(["2030-06-01", "2030-06-02"])
    expect(grouped["2030-06-01"].map((s) => s.id)).toEqual(["a", "c"])
  })
})

describe("validateSignup", () => {
  const ok = { ...EMPTY_SIGNUP_FORM, firstName: "A", lastName: "B", email: "a@x.com", consent: true }
  const base = { form: ok, charterAccepted: true, requirePhone: false, ageGatedShifts: [] }

  it("accepts a complete form", () => {
    expect(validateSignup(base)).toBeNull()
  })

  // #1047: an older, longer phone pre-filled from a remembered contact is named before sending.
  it("names an over-long phone or comment instead of sending it", () => {
    expect(validateSignup({ ...base, form: { ...ok, phone: "1".repeat(51) } })).toContain("Le téléphone ne peut pas dépasser 50 caractères")
    expect(validateSignup({ ...base, form: { ...ok, comment: "x".repeat(2001) } })).toContain("Le commentaire ne peut pas dépasser 2000 caractères")
    expect(validateSignup({ ...base, form: { ...ok, phone: "1".repeat(50), comment: "x".repeat(2000) } })).toBeNull()
  })

  it("checks charter, consent and required fields, in that order", () => {
    expect(validateSignup({ ...base, charterAccepted: false })).toContain("convention")
    expect(validateSignup({ ...base, form: { ...ok, consent: false } })).toBe("Coche la case d'accord sur tes données pour t'inscrire.")
    expect(validateSignup({ ...base, form: { ...ok, email: "" } })).toContain("obligatoires")
  })

  it("requires a non-blank phone only when the event does", () => {
    expect(validateSignup({ ...base, form: { ...ok, phone: "  " } })).toBeNull()
    expect(validateSignup({ ...base, requirePhone: true, form: { ...ok, phone: "  " } })).toContain("téléphone")
    expect(validateSignup({ ...base, requirePhone: true, form: { ...ok, phone: "079" } })).toBeNull()
  })

  it("age-gated shifts need a birth date old enough on the shift's date", () => {
    const gated = [shift("bar", { label: "Bar", minAge: 18, date: "2030-06-01T00:00:00.000Z" })]
    expect(validateSignup({ ...base, ageGatedShifts: gated })).toContain("Date de naissance")
    expect(validateSignup({ ...base, ageGatedShifts: gated, form: { ...ok, birthDate: "2015-01-01" } })).toContain("Bar (18 ans min.)")
    expect(validateSignup({ ...base, ageGatedShifts: gated, form: { ...ok, birthDate: "2000-01-01" } })).toBeNull()
  })
})

describe("toMyRegistrations / prefillContact", () => {
  it("maps the API registrations", () => {
    expect(toMyRegistrations([{ editToken: "t", status: "active", shift: { id: "s", label: "Bar", startTime: "10:00", endTime: "12:00" } }]))
      .toEqual([{ shiftId: "s", token: "t", label: "Bar", roleName: "", startTime: "10:00", endTime: "12:00", status: "active", cancellable: true }])
  })

  it("marks a registration the volunteer can't cancel online any more (#946)", () => {
    expect(toMyRegistrations([{ editToken: "t", status: "active", selfCancel: { allowed: false }, shift: { id: "s", label: "Bar", startTime: "10:00", endTime: "12:00" } }])[0].cancellable).toBe(false)
  })

  it("keeps each registration's status, for the withdrawal words", () => {
    const regs = toMyRegistrations(["active", "requested", "waiting", "offered"].map((status, i) => (
      { editToken: `t${i}`, status, shift: { id: `s${i}`, label: "Bar", startTime: "10:00", endTime: "12:00" } }
    )))
    expect(regs.map((r) => r.status)).toEqual(["active", "requested", "waiting", "offered"])
  })

  it("source wins when restoring the volunteer's own session", () => {
    const form = { ...EMPTY_SIGNUP_FORM, firstName: "Typed", phone: "" }
    expect(prefillContact(form, { firstName: "Saved", phone: "079" }, "source")).toMatchObject({ firstName: "Saved", phone: "079" })
  })

  it("form wins for an invite pre-fill: only empty fields are filled", () => {
    const form = { ...EMPTY_SIGNUP_FORM, firstName: "Typed" }
    expect(prefillContact(form, { firstName: "Member", lastName: "M", phone: null }, "form")).toMatchObject({ firstName: "Typed", lastName: "M", phone: "" })
  })
})

describe("sign-up consent (#706)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("says the organising association keeps using the data for later events", () => {
    expect(read("src/app/[eventSlug]/EventPageClient.tsx")).toContain("J&apos;accepte que l&apos;association qui organise cet événement utilise mes données pour gérer ses bénévoles, pour cet événement et les suivants.")
  })

  it("links to a section that exists on the privacy policy", () => {
    const [path, anchor] = CONSENT_PRIVACY_HREF.split("#")
    expect(path).toBe("/legal/privacy")
    expect(read("src/app/legal/privacy/page.tsx")).toContain(`id="${anchor}"`)
    expect(read("src/app/[eventSlug]/EventPageClient.tsx")).toContain("privacyHref = CONSENT_PRIVACY_HREF")
    // On the site's address from the organisation's host (src/lib/apex-links.ts).
    expect(read("src/app/[eventSlug]/page.tsx")).toContain("privacyHref={apexHref(consentPrivacyHref(), footerSite.apexBase)}")
  })
})

// #869: a shift proposed by an organizer's email, offered in one click on the sign-up page.
describe("proposedShiftState", () => {
  const shift = (over: Partial<{ id: string; status: string; waitlistEnabled: boolean }> = {}) =>
    ({ id: "s1", label: "Bar", date: "2030-07-04", startTime: "10:00", endTime: "12:00", status: "open", waitlistEnabled: false, minAge: null, ...over })
  const ctx = { myShiftIds: new Set<string>(), selected: new Set<string>(), reservedIds: new Set<string>(), accepting: true }

  it("offers a free shift, or its waitlist when full", () => {
    expect(proposedShiftState(shift(), ctx)).toBe("offer")
    expect(proposedShiftState(shift({ status: "full", waitlistEnabled: true }), ctx)).toBe("waitlist")
  })

  it("says when it is already chosen or held", () => {
    expect(proposedShiftState(shift(), { ...ctx, selected: new Set(["s1"]) })).toBe("selected")
    expect(proposedShiftState(shift(), { ...ctx, myShiftIds: new Set(["s1"]) })).toBe("held")
    expect(proposedShiftState(shift({ status: "full", waitlistEnabled: true }), { ...ctx, selected: new Set(["s1"]) })).toBe("selected_waitlist")
    expect(proposedShiftText("selected_waitlist", "Bar")).toBe("Liste d'attente choisie : Bar. Continue pour confirmer ton inscription sur la liste d'attente.")
  })

  it("is unavailable when gone, full without waitlist, reserved, closed or out of the window", () => {
    expect(proposedShiftState(undefined, ctx)).toBe("unavailable")
    expect(proposedShiftState(shift({ status: "full" }), ctx)).toBe("unavailable")
    expect(proposedShiftState(shift({ status: "cancelled" }), ctx)).toBe("unavailable")
    expect(proposedShiftState(shift(), { ...ctx, reservedIds: new Set(["s1"]) })).toBe("unavailable")
    expect(proposedShiftState(shift(), { ...ctx, accepting: false })).toBe("unavailable")
  })

  it("words each state", () => {
    expect(proposedShiftText("offer", "Bar, samedi 4 juillet, de 10 h à 12 h")).toBe("On te propose ce créneau : Bar, samedi 4 juillet, de 10 h à 12 h.")
    expect(proposedShiftText("unavailable", "")).toBe("Le créneau proposé n'est plus disponible. D'autres créneaux sont peut-être encore ouverts ci-dessous.")
  })
})

// #1171 lot 2: the minors' protection asks the birth date too.
describe("birth date for the minors' protection", () => {
  it("is required, and the hint says why, with the minimum ages when any", async () => {
    const { birthDateHint, validateSignup } = await import("../public-signup")
    const form = { firstName: "A", lastName: "B", email: "a@b.c", phone: "", birthDate: "", comment: "", consent: true }
    expect(validateSignup({ form, charterAccepted: true, requirePhone: false, ageGatedShifts: [], minorsProtected: true } as never)).toContain("protège les moins de 18 ans")
    expect(birthDateHint([], true)).toBe("Requise : cet événement protège les moins de 18 ans (pauses et charge).")
    expect(birthDateHint([{ label: "Bar", minAge: 16 }], true)).toBe("Requise : Bar (16 ans min.) ; cet événement protège aussi les moins de 18 ans (pauses et charge).")
  })
})

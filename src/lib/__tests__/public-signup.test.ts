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
      .toEqual([{ shiftId: "s", token: "t", label: "Bar", roleName: "", startTime: "10:00", endTime: "12:00", status: "active" }])
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
    expect(read("src/app/[eventSlug]/EventPageClient.tsx")).toContain("href={CONSENT_PRIVACY_HREF}")
  })
})

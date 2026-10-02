import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { closedMessage, openUntilMessage, refusalMessage, registrationState } from "../registration-window"
import { roleLimitMessage, roleLimitSelectionMessage } from "../role-limit"
import { reservationRefusal } from "../role-reservation"
import { gapLabel, personalDataLines } from "../signup-recap"
import { describeSignupFailure } from "../form-errors"
import { EMPTY_SIGNUP_FORM, validateSignup } from "../public-signup"
import { checkAnswers } from "../event-questions"
import { REQUEST_SHORT, WAITLIST_SHORT, WAITLIST_STEPS } from "../waitlist-copy"
import { fullShift } from "../signup-eligibility"

// The public sign-up addresses volunteers with « tu » (PRODUCT.md) and writes without the
// inclusive middle dot or « (e) » (#534). Separators such as « Bar · Bar nuit » are not checked.
const VOUS = /\b(vous|votre|vos)\b/i
const INCLUSIVE = /\p{L}·(e|s|es)\b|\p{L}\((e|s|es)\)/u

function expectTu(lines: (string | null)[]) {
  const texts = lines.filter((l): l is string => typeof l === "string" && l.length > 0)
  expect(texts.length).toBeGreaterThan(0)
  for (const t of texts) {
    expect(t, t).not.toMatch(VOUS)
    expect(t, t).not.toMatch(INCLUSIVE)
  }
}

const TZ = "Europe/Zurich"
const published = { publicStatus: "published", registrationsOpen: true }
const opensAt = new Date("2026-06-01T16:00:00Z")
const closesAt = new Date("2026-06-30T21:59:00Z")
const states = [
  registrationState({ ...published, registrationsOpen: false }),
  registrationState({ ...published, publicStatus: "draft" }),
  registrationState({ ...published, registrationOpensAt: opensAt }, new Date("2026-05-01T00:00:00Z")),
  registrationState({ ...published, registrationClosesAt: closesAt }, new Date("2026-07-01T00:00:00Z")),
]

describe("public sign-up copy uses « tu », without inclusive writing", () => {
  it("registration window messages", () => {
    expectTu(states.flatMap((s) => [closedMessage(s, TZ), refusalMessage(s, TZ)]))
    expectTu([openUntilMessage(registrationState({ ...published, registrationClosesAt: closesAt }, opensAt), TZ)])
    expect(closedMessage(states[0], TZ)).toBe("Les inscriptions sont fermées pour le moment. Si tu as déjà des créneaux, ton lien personnel reste valable.")
  })

  it("role limit and reserved role messages", () => {
    const breaches = [
      { roleName: "Loge", max: 2, held: 2, asked: 1 },
      { roleName: "Loge", max: 2, held: 0, asked: 3 },
      { roleName: "Loge", max: 2, held: 1, asked: 2 },
    ]
    expectTu(breaches.flatMap((b) => [roleLimitMessage(b), roleLimitSelectionMessage(b)]))
    expectTu([reservationRefusal("Sécurité", true), reservationRefusal("Sécurité", false)])
  })

  it("recap lines and notes", () => {
    expectTu(personalDataLines({ requirePhone: true, phoneGiven: true, needsBirthDate: true, commentGiven: true, answeredQuestions: ["Taille"] }))
    expectTu([gapLabel({ kind: "overlap", minutes: 30 }), gapLabel({ kind: "back_to_back" }), gapLabel({ kind: "break", minutes: 45 })])
    expectTu([WAITLIST_SHORT, REQUEST_SHORT, ...WAITLIST_STEPS])
  })

  it("sign-up failures, every kind", () => {
    const failures = [{ network: true }, { status: 400 }, { status: 409 }, { status: 429 }, { status: 500 }].map((i) => describeSignupFailure(i))
    expectTu(failures.flatMap((f) => [f.title, f.message, f.hint]))
  })

  it("form checks before sending, and the server's refusals", () => {
    const ok = { ...EMPTY_SIGNUP_FORM, firstName: "A", lastName: "B", email: "a@x.com", consent: true }
    const base = { form: ok, charterAccepted: true, requirePhone: false, ageGatedShifts: [] }
    expectTu([
      validateSignup({ ...base, charterAccepted: false }),
      validateSignup({ ...base, form: { ...ok, consent: false } }),
      validateSignup({ ...base, form: { ...ok, email: "" } }),
      validateSignup({ ...base, requirePhone: true }),
    ])
    const check = checkAnswers([{ id: "p", label: "Permis", type: "yesno", options: [], required: true }], { p: "peut-être" })
    expectTu(check.ok ? [] : check.errors.map((e) => e.message))
    expectTu([String(fullShift("a", "Bar").body.error)])
  })

  it("the sign-up route's own error messages", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/public/registrations/route.ts"), "utf8")
    // Every sentence literal: capitalised, with a space, ending with a full stop.
    const errors = [...src.matchAll(/"([A-ZÀ-Ý][^"\n]* [^"\n]*\.)"/g)].map((m) => m[1])
    expect(errors).toContain("Tu as déjà une inscription pour l'un de ces créneaux.")
    expect(errors.length).toBeGreaterThanOrEqual(5)
    expectTu(errors)
  })

  it("the recap and the event page headings", () => {
    const recap = readFileSync(join(process.cwd(), "src/components/public/SignupRecap.tsx"), "utf8")
    expect(recap).not.toMatch(VOUS)
    expect(recap).toContain("Tes créneaux")
    const page = readFileSync(join(process.cwd(), "src/app/[eventSlug]/EventPageClient.tsx"), "utf8")
    expect(page).toContain("Tes informations")
    expect(page).toContain("Session ouverte au nom de ")
    expect(page).not.toMatch(INCLUSIVE)
    // The organizer preview keeps « vous »: its only string is skipped, every other text tutoies.
    const volunteerText = page.replace("Aperçu indisponible. Vérifiez votre connexion et réessayez.", "").replaceAll("rendez-vous", "")
    expect(volunteerText).not.toMatch(VOUS)
  })
})

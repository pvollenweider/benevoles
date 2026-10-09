import { describe, it, expect, vi } from "vitest"
import { confirmable, looksAutomated, NO_LINK_MESSAGE, plainLabel, signupOpen, signupSchema, slugify, SIGNUP_MIN_FILL_MS } from "../signup"
import { render } from "../notifications/templates"
import { memoryStore } from "../rate-limit"
import { sendWindows, takeSendAllowance, type SendLimits } from "../notifications/send-limits"

describe("self-service sign-up rules (#810, part 4b)", () => {
  it("validates and normalises the form, with a sentence per field", () => {
    const ok = signupSchema.safeParse({ organizationName: "  Fête du village ", contactName: "Camille", email: " Camille@Example.ORG " })
    expect(ok.success && ok.data).toMatchObject({ organizationName: "Fête du village", email: "camille@example.org" })
    const bad = signupSchema.safeParse({ organizationName: "F", contactName: "Camille", email: "camille@example.org" })
    expect(!bad.success && bad.error.issues[0].message).toBe("Indiquez le nom de l'association (2 caractères au moins).")
    const mail = signupSchema.safeParse({ organizationName: "Fête", contactName: "Camille", email: "camille" })
    expect(!mail.success && mail.error.issues[0].message).toBe("Indiquez une adresse email valide, par exemple nom@exemple.org.")
  })

  it("spots an automated submission: honeypot, missing or too short fill time", () => {
    const now = 1_000_000
    expect(looksAutomated({ website: "", startedAt: now - SIGNUP_MIN_FILL_MS - 1 }, now)).toBe(false)
    expect(looksAutomated({ website: "http://spam", startedAt: now - 60_000 }, now)).toBe(true)
    expect(looksAutomated({ startedAt: now - 500 }, now)).toBe(true)
    expect(looksAutomated({}, now)).toBe(true)
  })

  it("is open unless SIGNUP=off", () => {
    expect(signupOpen({})).toBe(true)
    expect(signupOpen({ SIGNUP: "on" })).toBe(true)
    expect(signupOpen({ SIGNUP: " OFF " })).toBe(false)
  })

  it("confirms a request once, before it expires", () => {
    const now = new Date("2026-10-09T12:00:00Z")
    expect(confirmable(null, now)).toBe("unknown")
    expect(confirmable({ expiresAt: new Date("2026-10-09T13:00:00Z"), confirmedAt: null }, now)).toBe("ok")
    expect(confirmable({ expiresAt: new Date("2026-10-09T11:00:00Z"), confirmedAt: null }, now)).toBe("expired")
    expect(confirmable({ expiresAt: new Date("2026-10-09T13:00:00Z"), confirmedAt: now }, now)).toBe("used")
  })

  it("makes a subdomain from the name", () => {
    expect(slugify("Fête du Village de Saint-Légier !")).toBe("fete-du-village-de-saint-legier")
    expect(slugify("   ")).toBe("")
  })
})

describe("sign-up confirmation emails and the sending limits (#810)", () => {
  const limits: SendLimits = { orgPerMinute: 100, orgPerDay: 100, orgBulkPerDay: 100, orgAccountPerDay: 100, globalPerMinute: 100, recipientPerHour: 2, signupConfirmationsPerHour: 3 }

  it("counts against the per-recipient and the platform's hourly sign-up caps, and drops over them", async () => {
    expect(sendWindows(null, "signup_confirmation", limits, "a@b.ch").map((w) => w.name)).toEqual(["recipient_per_hour", "signup_per_hour", "global_per_minute"])
    const store = memoryStore()
    const send = (email: string) => takeSendAllowance(null, "signup_confirmation", { store, limits, recipientEmail: email, alert: vi.fn() })
    expect((await send("a@example.org")).ok).toBe(true)
    expect((await send("b@example.org")).ok).toBe(true)
    expect((await send("c@example.org")).ok).toBe(true)
    // The fourth address of the hour: dropped, not held (the form must not become a mail cannon).
    expect(await send("d@example.org")).toMatchObject({ ok: false, limit: "signup_per_hour", drop: true })
  })
})

// Security review of part 4b: typed text must never become a phishing vector.
describe("typed text and phishing (#810)", () => {
  it("refuses links, addresses and line breaks in the names", () => {
    for (const organizationName of ["Gagnez sur http://evil.example", "www.evil.example", "Fête chez bob@evil.example", "Fête\nCliquez", "evil.com"]) {
      const r = signupSchema.safeParse({ organizationName, contactName: "Camille", email: "camille@example.org" })
      expect(!r.success && r.error.issues[0].message).toBe(NO_LINK_MESSAGE)
    }
    expect(signupSchema.safeParse({ organizationName: "Fête du village de Saint-Légier", contactName: "Camille Dupont-Muller", email: "c@example.org" }).success).toBe(true)
  })

  it("sends a confirmation email with no typed text at all", () => {
    const email = render({ kind: "signup_confirmation", recipient: { email: "victim@example.org" }, data: { confirmUrl: "https://www.benevol.app/inscription/confirmer?t=x", hours: 24, organizationName: "EVIL TEXT", contactName: "EVIL NAME" } })
    expect(email.html).not.toContain("EVIL")
    expect(email.text).not.toContain("EVIL")
    expect(email.text).toContain("https://www.benevol.app/inscription/confirmer?t=x")
  })

  it("flattens typed text for an operator alert: one line, no link, 80 characters at most", () => {
    expect(plainLabel("Fête\n  du village https://evil.example/x")).toBe("Fête du village [lien retiré]")
    expect(plainLabel("x".repeat(200))).toHaveLength(80)
  })
})


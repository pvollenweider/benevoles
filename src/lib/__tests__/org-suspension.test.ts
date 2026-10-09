import { describe, it, expect } from "vitest"
import { decideSuspension, orgStatus, ORG_STATUS_LABELS } from "../org-suspension"
import { liftSuspensionRecap, suspendOrgRecap, toggleOrgRecap } from "../action-recap"

const now = new Date("2026-10-09T10:00:00Z")
const active = { active: true, suspendedAt: null }
const inactive = { active: false, suspendedAt: null }
const suspended = { active: false, suspendedAt: new Date("2026-10-01T00:00:00Z") }

describe("organisation suspension for abuse (#810)", () => {
  it("tells the three states apart, suspended first", () => {
    expect(orgStatus(active)).toBe("active")
    expect(orgStatus(inactive)).toBe("inactive")
    expect(orgStatus(suspended)).toBe("suspended")
    expect(orgStatus({ active: false, suspendedAt: "2026-10-01T00:00:00.000Z" })).toBe("suspended")
    expect(ORG_STATUS_LABELS.suspended).toBe("Suspendue")
  })

  it("suspends with a reason: deactivated, dated, queued emails cancelled, logged", () => {
    expect(decideSuspension(active, { suspended: true, suspensionReason: "  Spam vers des tiers  " }, now)).toEqual({
      ok: true,
      update: { active: false, suspendedAt: now, suspensionReason: "Spam vers des tiers" },
      event: "suspended",
      cancelQueuedEmails: true,
    })
    // An already deactivated organisation can be suspended too.
    expect(decideSuspension(inactive, { suspended: true, suspensionReason: "abus" }, now).ok).toBe(true)
  })

  it("refuses a suspension without a reason, or twice", () => {
    expect(decideSuspension(active, { suspended: true }, now)).toMatchObject({ ok: false, status: 400 })
    expect(decideSuspension(active, { suspended: true, suspensionReason: "  a " }, now)).toMatchObject({ ok: false, status: 400 })
    expect(decideSuspension(suspended, { suspended: true, suspensionReason: "encore" }, now)).toMatchObject({ ok: false, status: 409 })
  })

  it("never reactivates a suspended organisation: the suspension is lifted first, separately", () => {
    expect(decideSuspension(suspended, { active: true }, now)).toMatchObject({ ok: false, status: 409, error: "Organisation suspendue : levez d'abord la suspension." })
    expect(decideSuspension(suspended, { suspended: false }, now)).toEqual({ ok: true, update: { suspendedAt: null, suspensionReason: null }, event: "suspension_lifted", cancelQueuedEmails: false })
    // Lifting leaves it deactivated: `active` is not in the update.
    expect("active" in (decideSuspension(suspended, { suspended: false }, now) as { update: object }).update).toBe(false)
    expect(decideSuspension(inactive, { suspended: false }, now)).toMatchObject({ ok: false, status: 409 })
  })

  it("keeps plain activation and deactivation, and one action at a time", () => {
    expect(decideSuspension(active, { active: false }, now)).toEqual({ ok: true, update: { active: false }, event: null, cancelQueuedEmails: true })
    expect(decideSuspension(inactive, { active: true }, now)).toEqual({ ok: true, update: { active: true }, event: null, cancelQueuedEmails: false })
    expect(decideSuspension(active, { active: false, suspended: true, suspensionReason: "abus" }, now)).toMatchObject({ ok: false, status: 400 })
    expect(decideSuspension(active, {}, now)).toEqual({ ok: true, update: {}, event: null, cancelQueuedEmails: false })
  })

  it("says what each action does, in the confirmation", () => {
    expect(suspendOrgRecap("Club").lines.join(" ")).toContain("jamais effacées automatiquement")
    expect(liftSuspensionRecap("Club").lines[0]).toBe("L'organisation reste désactivée : il faudra ensuite la réactiver, à part.")
    expect(toggleOrgRecap("Club", true).lines).toContain("Ses emails en attente sont annulés et ne partiront jamais.")
  })
})

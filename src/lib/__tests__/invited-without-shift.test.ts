import { describe, it, expect } from "vitest"
import { audienceFromQuery, audienceLabel, selectInvitedWithoutShift } from "../targeted-message"

// « Invités sans créneau confirmé » (#481).
const inv = (volunteerId: string, day: number, email: string | null = `${volunteerId}@x.ch`) => ({ volunteerId, sentAt: new Date(Date.UTC(2026, 5, day)), volunteer: { email } })

describe("selectInvitedWithoutShift", () => {
  it("keeps invited people without an active registration, one per person, flagging waitlist-only", () => {
    const invites = [inv("a", 1), inv("a", 5), inv("b", 1), inv("c", 1), inv("d", 1), inv("e", 1, null)]
    const regs = [
      { volunteerId: "b", status: "active" },
      { volunteerId: "c", status: "waiting" },
      { volunteerId: "d", status: "cancelled" },
    ]
    const out = selectInvitedWithoutShift(invites, regs)
    expect(out.map((o) => [o.volunteerId, o.waitlistOnly])).toEqual([["a", false], ["c", true], ["d", false]])
    // The latest invitation of a person invited twice.
    expect(out[0].invite.sentAt.getUTCDate()).toBe(5)
  })

  it("counts an offer as waitlist, not as a confirmed shift", () => {
    expect(selectInvitedWithoutShift([inv("a", 1)], [{ volunteerId: "a", status: "offered" }])).toMatchObject([{ volunteerId: "a", waitlistOnly: true }])
  })
})

describe("audience wiring", () => {
  it("has a label and a query value", () => {
    expect(audienceLabel({ kind: "invited_without_shift" })).toBe("les invités sans créneau confirmé")
    expect(audienceFromQuery({ audience: "invited" })).toEqual({ kind: "invited_without_shift" })
  })
})

describe("targeted message email to an invited person", () => {
  it("carries a « Choisir mes créneaux » link instead of the personal page", async () => {
    const { render } = await import("../notifications/templates")
    const out = render({
      kind: "targeted_message",
      recipient: { email: "dan@x.ch", name: "Dan" },
      data: { volunteerName: "Dan", organizationName: "Org", eventTitle: "Fête", subject: "Il reste des places", message: "Au bar samedi.", shifts: [], signupUrl: "https://org.benevol.app/fete" },
    })
    expect(out.html).toContain("Choisir mes créneaux")
    expect(out.html).toContain("https://org.benevol.app/fete")
    expect(out.text).toContain("Choisir tes créneaux : https://org.benevol.app/fete")
    expect(out.html).not.toContain("Gérer mes inscriptions")
  })
})

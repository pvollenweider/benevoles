import { describe, it, expect } from "vitest"
import { renderSectorLeaderWithdrawalDigest, renderWithdrawalAdminDigest } from "../templates/withdrawal-digest"

// #869: several withdrawals of one event within a few minutes reach each person as one email.
const item = (over: Record<string, unknown> = {}) => ({
  volunteerName: "Aline Exemple", shiftId: "s-1", shiftLabel: "Bar", roleName: "Bar", shiftDate: "04/07/2026",
  startTime: "10:00", endTime: "12:00", placesMissing: 1, waitlistTookSpot: false, message: null, ...over,
})
const payload = (items: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  kind: "registration_cancelled" as const,
  recipient: { email: "a@x.org" },
  data: { eventId: "evt-1", eventTitle: "Fête", ...extra, items: items.map((value, i) => ({ key: `r${i}`, value })) },
})

describe("grouped withdrawal email to the organisers", () => {
  it("reads like a single withdrawal when there is one", () => {
    const mail = renderWithdrawalAdminDigest(payload([item()]))
    expect(mail.subject).toBe("Désistement — Fête")
    expect(mail.html).toContain("Trouver un remplaçant")
  })

  it("lists several, with one replacement link per shift still missing someone", () => {
    const mail = renderWithdrawalAdminDigest(payload([
      item(),
      item({ volunteerName: "Nicolas Renaud", shiftId: "s-2", shiftLabel: "Accueil", roleName: "Accueil", message: "Malade" }),
      item({ volunteerName: "Zoé Martin", shiftId: "s-3", waitlistTookSpot: true, placesMissing: 0 }),
    ]))
    expect(mail.subject).toBe("3 désistements — Fête")
    expect(mail.text).toContain("- Nicolas Renaud, Accueil (04/07/2026 · 10:00–12:00) : il manque 1 place")
    expect(mail.text).toContain("  Message : « Malade »")
    expect(mail.text).toContain("staffing/search?shift=s-1")
    expect(mail.text).toContain("staffing/search?shift=s-2")
    expect(mail.text).not.toContain("staffing/search?shift=s-3")
  })

  it("still renders a row queued before grouping (no items)", () => {
    const mail = renderWithdrawalAdminDigest({ kind: "registration_cancelled", recipient: { email: "a@x.org" }, data: { eventId: "evt-1", eventTitle: "Fête", ...item() } })
    expect(mail.subject).toBe("Désistement — Fête")
  })
})

describe("grouped withdrawal email to a sector leader", () => {
  it("lists several on the leader's shifts, with their page", () => {
    const mail = renderSectorLeaderWithdrawalDigest({ ...payload([item(), item({ volunteerName: "Nicolas Renaud" })], { leaderName: "Sarah Jaquet", orgSlug: "rhone", token: "lead-tok" }), kind: "sector_leader_withdrawal" })
    expect(mail.subject).toBe("2 désistements — Fête")
    expect(mail.text).toContain("Bonjour Sarah,")
    expect(mail.text).toContain("lead-tok")
  })
})

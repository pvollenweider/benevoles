import { describe, it, expect } from "vitest"
import { renderSectorLeaderInvite, renderSectorLeaderNewSignup, renderSectorLeaderWithdrawal } from "../templates/sector-leaders"
import type { NotificationPayload } from "../types"

// #1169: a sector leader's emails say « secteur »; a poste leader's keep their wording.
const payload = (kind: NotificationPayload["kind"], data: Record<string, unknown>): NotificationPayload =>
  ({ kind, recipient: { email: "paula@example.org", name: "Paula Martin" }, data } as NotificationPayload)

const shiftData = { leaderName: "Paula Martin", roleName: "Parking Nord", eventTitle: "Fête", volunteerName: "Ana", shiftLabel: "Matin", shiftDate: "01.06.2030", startTime: "08:00", endTime: "12:00", orgSlug: "village", token: "tok" }

describe("leader emails by scope (#1169)", () => {
  it("invites a sector leader to the sector, and a poste leader to the poste as before", () => {
    const sector = renderSectorLeaderInvite(payload("sector_leader_invite", { leaderName: "Paula Martin", roleName: "Parking", scopeKind: "sector", eventTitle: "Fête", orgSlug: "village", token: "tok" }))
    expect(sector.text).toContain("responsable du secteur « Parking » pour Fête")
    expect(sector.text).toContain("sur les postes de ce secteur")
    expect(sector.html).toContain("responsable du secteur <strong>Parking</strong>")
    const poste = renderSectorLeaderInvite(payload("sector_leader_invite", { leaderName: "Paula Martin", roleName: "Bar", eventTitle: "Fête", orgSlug: "village", token: "tok" }))
    expect(poste.text).toContain("responsable du poste « Bar » pour Fête")
    expect(poste.text).not.toContain("secteur")
  })

  it("names the sector in a sign-up and a withdrawal for a sector leader only", () => {
    const sector = renderSectorLeaderNewSignup(payload("sector_leader_new_signup", { ...shiftData, sectorName: "Parking" }))
    expect(sector.text).toContain("(01.06.2030 · 08:00–12:00), un poste du secteur « Parking », dont vous êtes responsable pour Fête.")
    const poste = renderSectorLeaderNewSignup(payload("sector_leader_new_signup", shiftData))
    expect(poste.text).toContain("(01.06.2030 · 08:00–12:00), dont vous êtes responsable pour Fête.")
    expect(poste.html).toContain("–12:00), dont vous êtes responsable")

    const out = renderSectorLeaderWithdrawal(payload("sector_leader_withdrawal", { ...shiftData, sectorName: "Parking", placesMissing: 1, waitlistTookSpot: false }))
    expect(out.text).toContain("un poste du secteur « Parking », dont vous êtes responsable")
    expect(out.subject).toBe("Désistement — Parking Nord")
    const posteOut = renderSectorLeaderWithdrawal(payload("sector_leader_withdrawal", { ...shiftData, placesMissing: 1, waitlistTookSpot: false }))
    expect(posteOut.text).toContain("–12:00), dont vous êtes responsable pour Fête.")
  })

  it("escapes the sector's name", () => {
    const out = renderSectorLeaderNewSignup(payload("sector_leader_new_signup", { ...shiftData, sectorName: "<b>P</b>" }))
    expect(out.html).toContain("&lt;b&gt;P&lt;/b&gt;")
  })
})

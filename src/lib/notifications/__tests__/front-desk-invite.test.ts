import { describe, it, expect } from "vitest"
import { render } from "../templates"
import { accountLink } from "@/lib/outbox-recipient-check"
import { sendCategory, sendWindows } from "../send-limits"

// Front-desk invitation (#1142): a dedicated email, in the style of the admin invitation.
const payload = {
  kind: "front_desk_invite" as const,
  recipient: { email: "lea.favre@example.org", name: "Léa Favre" },
  data: {
    adminName: "Léa <Favre>",
    organizationName: "Fête du village",
    eventTitle: "Fête du village 2027",
    eventDates: "du 12 au 14 juin 2027",
    untilLabel: "14 juin 2027",
    inviterName: "Sacha Bonvin",
    inviteUrl: "https://app.benevol.test/admin/accept-invite?token=abc123",
  },
}

describe("front-desk invitation email", () => {
  const email = render(payload)

  it("has the required subject", () => {
    expect(email.subject).toBe("Fête du village : votre accès accueil pour Fête du village 2027")
  })

  it("says who invited, for which event and dates, what it allows, until when, and how to activate", () => {
    expect(email.text).toContain("Sacha Bonvin vous invite à un accès accueil pour Fête du village 2027, du 12 au 14 juin 2027")
    expect(email.text).toContain("marquer les présences le jour de l'événement")
    expect(email.text).toContain("voir le nom et le téléphone des bénévoles attendus")
    expect(email.text).toContain("jusqu'à la fin de l'événement, le 14 juin 2027 inclus")
    expect(email.text).toContain("valable 7 jours")
    expect(email.text).toContain(payload.data.inviteUrl)
    expect(email.text).toContain("Aucune autre partie de l'espace de l'organisation ne vous est ouverte")
    expect(email.html).toContain("Choisir mon mot de passe")
  })

  it("escapes the person's name and carries no marketing sentence", () => {
    expect(email.html).toContain("Léa &lt;Favre&gt;")
    expect(email.html).not.toContain("Léa <Favre>")
    for (const marketing of [/offre/i, /profitez/i, /gratuit/i, /découvrez/i, /abonnez/i, /promotion/i]) {
      expect(email.text, String(marketing)).not.toMatch(marketing)
      expect(email.html, String(marketing)).not.toMatch(marketing)
    }
  })

  it("counts as an account email and its link is the account's setup link", () => {
    expect(sendCategory("front_desk_invite")).toBe("account")
    expect(sendWindows("org-1", "front_desk_invite").map((w) => w.name)).toContain("org_account_per_day")
    expect(accountLink({ kind: "front_desk_invite", data: { inviteUrl: payload.data.inviteUrl } })).toEqual({ column: "setupTokenHash", token: "abc123" })
  })
})

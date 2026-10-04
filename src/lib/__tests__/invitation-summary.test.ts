import { describe, it, expect } from "vitest"
import { inviteResultText, remindResultText } from "../invitation-summary"

describe("inviteResultText", () => {
  it("reads as a sentence with agreement in number, refused emails apart", () => {
    expect(inviteResultText({ invitedNew: 3, emailsSent: 2, emailsFailed: 1, membersWithoutEmail: 1 })).toBe("3 invités, 2 emails envoyés, 1 échec d'envoi, 1 sans email")
    expect(inviteResultText({ invitedNew: 1, skippedExisting: 1, emailsSent: 1 })).toBe("1 invité, 1 déjà invité, 1 email envoyé")
    expect(inviteResultText({ emailsFailed: 2 })).toBe("2 échecs d'envoi")
  })

  it("has no middle dot", () => {
    expect(inviteResultText({ invitedNew: 2, emailsSent: 1, emailsFailed: 1 })).not.toMatch(/·/)
  })
})

describe("remindResultText", () => {
  it("counts refused reminders apart", () => {
    expect(remindResultText({ sent: 1 })).toBe("1 relance envoyée")
    expect(remindResultText({ sent: 2, failed: 1 })).toBe("2 relances envoyées, 1 échec d'envoi")
    expect(remindResultText({ sent: 0, failed: 2 })).toBe("0 relance envoyée, 2 échecs d'envoi")
  })

  it("counts people who declined and were not relaunched (#558), apart from sent and failed", () => {
    expect(remindResultText({ sent: 2, declinedSkipped: 1 })).toBe("2 relances envoyées, 1 personne pas disponible non relancée")
    expect(remindResultText({ sent: 1, failed: 1, declinedSkipped: 2 })).toBe("1 relance envoyée, 1 échec d'envoi, 2 personnes pas disponibles non relancées")
  })
})

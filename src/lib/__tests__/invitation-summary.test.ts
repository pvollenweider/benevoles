import { describe, it, expect } from "vitest"
import { inviteResultText, manualReminderResultText, remindResultText, remindWaitHint } from "../invitation-summary"

describe("inviteResultText", () => {
  it("says the emails are on their way, never sent, with agreement in number (#597, #1105)", () => {
    expect(inviteResultText({ invitedNew: 3, emailsQueued: 3, membersWithoutEmail: 1 })).toBe("3 invités, 3 emails en cours d'envoi, 1 sans email.")
    expect(inviteResultText({ invitedNew: 1, skippedExisting: 1, emailsQueued: 1 })).toBe("1 invité, 1 déjà invité, 1 email en cours d'envoi.")
    expect(inviteResultText({ invitedNew: 150, emailsQueued: 150 })).not.toMatch(/échec|envoyés/)
  })

  it("puts an invitation not sent again in its own sentence", () => {
    expect(inviteResultText({ skippedExisting: 1, recentlySkipped: 1 })).toBe("1 déjà invité. 1 invitation pas renvoyée : déjà envoyée il y a moins de 5 minutes.")
    expect(inviteResultText({ skippedExisting: 2, recentlySkipped: 2 })).toBe("2 déjà invités. 2 invitations pas renvoyées : déjà envoyées il y a moins de 5 minutes.")
  })

  it("never uses a middle dot", () => {
    expect(inviteResultText({ invitedNew: 2, emailsQueued: 1, recentlySkipped: 1 })).not.toMatch(/·/)
  })
})

describe("remindResultText", () => {
  it("counts the reminders on their way, with agreement in number (#1105)", () => {
    expect(remindResultText({ queued: 1 })).toBe("1 relance en cours d'envoi.")
    expect(remindResultText({ queued: 150 })).toBe("150 relances en cours d'envoi.")
  })

  it("says how many were left out because they were emailed less than 48 hours ago", () => {
    expect(remindResultText({ queued: 12, recentlySkipped: 3 })).toBe("12 relances en cours d'envoi. 3 personnes invitées ou relancées il y a moins de 48 heures ne sont pas relancées à nouveau.")
    expect(remindResultText({ queued: 0, recentlySkipped: 1 })).toBe("Personne n'a été relancé. 1 personne invitée ou relancée il y a moins de 48 heures n'est pas relancée à nouveau.")
  })

  it("mentions members who declined (#558)", () => {
    expect(remindResultText({ queued: 2, declinedSkipped: 1 })).toBe("2 relances en cours d'envoi. 1 personne pas disponible non relancée.")
    expect(remindResultText({ queued: 1, recentlySkipped: 2, declinedSkipped: 2 })).toBe("1 relance en cours d'envoi. 2 personnes invitées ou relancées il y a moins de 48 heures ne sont pas relancées à nouveau. 2 personnes pas disponibles non relancées.")
  })
})

describe("remindWaitHint", () => {
  it("is absent when nobody is in the 48-hour window", () => {
    expect(remindWaitHint({ eligible: 4, recent: 0 })).toBeNull()
  })

  it("explains the difference with « Sans réponse »", () => {
    expect(remindWaitHint({ eligible: 2, recent: 3 })).toBe("3 personnes invitées ou relancées il y a moins de 48 heures ne seront pas relancées cette fois.")
    expect(remindWaitHint({ eligible: 2, recent: 1 })).toBe("1 personne invitée ou relancée il y a moins de 48 heures ne sera pas relancée cette fois.")
  })

  it("says when a reminder becomes possible if nobody can be reminded yet", () => {
    expect(remindWaitHint({ eligible: 0, recent: 5 })).toBe("Les 5 sans créneau ont été invités ou relancés il y a moins de 48 heures : vous pourrez les relancer après ce délai.")
    expect(remindWaitHint({ eligible: 0, recent: 1 })).toBe("La personne sans créneau a été invitée ou relancée il y a moins de 48 heures : vous pourrez la relancer après ce délai.")
  })
})

describe("manualReminderResultText", () => {
  it("counts the reminders on their way (#1105)", () => {
    expect(manualReminderResultText(1)).toBe("1 rappel en cours d'envoi")
    expect(manualReminderResultText(42)).toBe("42 rappels en cours d'envoi")
  })
})

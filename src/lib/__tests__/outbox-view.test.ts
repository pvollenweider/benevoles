import { describe, it, expect } from "vitest"
import { encodeOutcomeReason, kindLabel, KIND_LABELS, outboxCounts, outboxErrorSentence, outboxHeadline, outboxRowView, outboxState, recipientLabel } from "../outbox-view"
import { MAX_ATTEMPTS } from "../notifications/types"

const row = { id: "o1", status: "pending", attempts: 0, nextAttemptAt: new Date("2026-07-01T10:00:00Z"), lastError: null, sentAt: null, createdAt: new Date("2026-07-01T09:55:00Z") }

// Email delivery page (#382).
describe("outbox view", () => {
  it("labels every notification kind, and falls back to the raw kind", () => {
    expect(Object.keys(KIND_LABELS)).toHaveLength(25)
    expect(kindLabel("member_invite")).toBe("Invitation d'un membre")
    expect(kindLabel("waitlist_offered")).toBe("Liste d'attente : place proposée")
    expect(kindLabel("something_new")).toBe("something_new")
  })

  it("derives four states from status and attempts", () => {
    expect(outboxState({ status: "pending", attempts: 0 })).toBe("pending")
    expect(outboxState({ status: "pending", attempts: 2 })).toBe("retrying")
    expect(outboxState({ status: "sending", attempts: 0 })).toBe("pending")
    expect(outboxState({ status: "sent", attempts: 1 })).toBe("sent")
    expect(outboxState({ status: "failed", attempts: 6 })).toBe("failed")
  })

  it("shows the recipient without leaking more than name and email", () => {
    expect(recipientLabel({ name: "Alice Martin", email: "a@x.ch" })).toBe("Alice Martin <a@x.ch>")
    expect(recipientLabel({ email: "a@x.ch" })).toBe("a@x.ch")
    expect(recipientLabel({ phone: "079" })).toBe("079")
    expect(recipientLabel(undefined)).toBe("—")
  })

  it("builds a row: retry count while retrying, next attempt while waiting, retry only after giving up", () => {
    // #598: an old, raw lastError (pre-dating the structured code) is never shown as is — a
    // neutral sentence replaces it on the delivery page.
    const retrying = outboxRowView({ ...row, attempts: 1, lastError: "SMTP 451" }, { kind: "reminder_j1", recipient: { email: "a@x.ch" } })
    expect(retrying).toMatchObject({ state: "retrying", stateLabel: "Nouvel essai prévu", kindLabel: "Rappel J-1", attemptsLabel: `essai 2 sur ${MAX_ATTEMPTS}`, lastError: "Échec technique de l'envoi (détail non disponible).", canRetry: false })
    expect(retrying.nextAttemptAt).toEqual(row.nextAttemptAt)

    const failed = outboxRowView({ ...row, status: "failed", attempts: 6, lastError: "Mailbox full" }, { kind: "targeted_message", recipient: { name: "Bob", email: "b@x.ch" } })
    expect(failed).toMatchObject({ state: "failed", canRetry: true, attemptsLabel: "", nextAttemptAt: null, recipient: "Bob <b@x.ch>" })

    const sent = outboxRowView({ ...row, status: "sent", sentAt: new Date("2026-07-01T10:01:00Z") }, { kind: "registration_confirmation", recipient: { email: "c@x.ch" } })
    expect(sent).toMatchObject({ state: "sent", nextAttemptAt: null, canRetry: false })

    expect(outboxRowView(row, null)).toMatchObject({ kind: "?", kindLabel: "Contenu illisible", recipient: "—" })
  })

  // #598: the delivery page's wording — states only what's proven, never "délivré", and a
  // permanent rejection reads differently from a temporary incident.
  describe("outboxErrorSentence / encodeOutcomeReason", () => {
    it("is null when there is no error", () => {
      expect(outboxErrorSentence(null)).toBeNull()
    })

    it("never shows the raw text of a pre-#598 lastError", () => {
      expect(outboxErrorSentence("550 5.1.1 jane.doe@example.org: no such user")).toBe("Échec technique de l'envoi (détail non disponible).")
    })

    it("a permanent rejection names the reason and says the address needs checking", () => {
      const code = encodeOutcomeReason({ outcome: "rejected_permanent", reason: "mailbox_unknown", responseCode: 550, enhancedStatus: "5.1.1" })
      const sentence = outboxErrorSentence(code)
      expect(sentence).toContain("Refus définitif du serveur d'envoi (motif indiqué : boîte aux lettres introuvable)")
      expect(sentence).toContain("boîte aux lettres introuvable")
      expect(sentence).toContain("Adresse à vérifier")
      expect(sentence).not.toContain("délivré")
    })

    it("a temporary failure reads as an incident, not a verdict on the address", () => {
      const code = encodeOutcomeReason({ outcome: "failed_temporary", reason: "timeout", responseCode: null, enhancedStatus: null })
      const sentence = outboxErrorSentence(code)
      expect(sentence).toContain("Incident temporaire")
      expect(sentence).toContain("nouvel essai prévu")
      expect(sentence).not.toContain("Adresse à vérifier")
    })

    it("never states more than proven: accepted is never called délivré", () => {
      const code = encodeOutcomeReason({ outcome: "accepted_by_relay", reason: null, responseCode: null, enhancedStatus: null })
      expect(outboxErrorSentence(code)).not.toContain("délivré")
    })
  })

  it("counts and summarizes", () => {
    const c = outboxCounts([{ state: "sent" }, { state: "sent" }, { state: "retrying" }, { state: "failed" }])
    expect(c).toEqual({ pending: 0, retrying: 1, sent: 2, failed: 1 })
    expect(outboxHeadline(c)).toBe("1 email en échec définitif : à renvoyer ou à vérifier.")
    expect(outboxHeadline({ pending: 2, retrying: 1, sent: 0, failed: 0 })).toBe("3 emails en cours d'envoi.")
    expect(outboxHeadline({ pending: 0, retrying: 0, sent: 5, failed: 0 })).toBe("Tous les emails récents sont partis.")
  })
})

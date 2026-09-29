import { describe, it, expect } from "vitest"
import { kindLabel, KIND_LABELS, outboxCounts, outboxHeadline, outboxRowView, outboxState, recipientLabel } from "../outbox-view"
import { MAX_ATTEMPTS } from "../notifications/types"

const row = { id: "o1", status: "pending", attempts: 0, nextAttemptAt: new Date("2026-07-01T10:00:00Z"), lastError: null, sentAt: null, createdAt: new Date("2026-07-01T09:55:00Z") }

// Email delivery page (#382).
describe("outbox view", () => {
  it("labels every notification kind, and falls back to the raw kind", () => {
    expect(Object.keys(KIND_LABELS)).toHaveLength(20)
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
    const retrying = outboxRowView({ ...row, attempts: 1, lastError: "SMTP 451" }, { kind: "reminder_j1", recipient: { email: "a@x.ch" } })
    expect(retrying).toMatchObject({ state: "retrying", stateLabel: "Nouvel essai prévu", kindLabel: "Rappel J-1", attemptsLabel: `essai 2 sur ${MAX_ATTEMPTS}`, lastError: "SMTP 451", canRetry: false })
    expect(retrying.nextAttemptAt).toEqual(row.nextAttemptAt)

    const failed = outboxRowView({ ...row, status: "failed", attempts: 6, lastError: "Mailbox full" }, { kind: "targeted_message", recipient: { name: "Bob", email: "b@x.ch" } })
    expect(failed).toMatchObject({ state: "failed", canRetry: true, attemptsLabel: "", nextAttemptAt: null, recipient: "Bob <b@x.ch>" })

    const sent = outboxRowView({ ...row, status: "sent", sentAt: new Date("2026-07-01T10:01:00Z") }, { kind: "registration_confirmation", recipient: { email: "c@x.ch" } })
    expect(sent).toMatchObject({ state: "sent", nextAttemptAt: null, canRetry: false })

    expect(outboxRowView(row, null)).toMatchObject({ kind: "?", kindLabel: "Contenu illisible", recipient: "—" })
  })

  it("counts and summarizes", () => {
    const c = outboxCounts([{ state: "sent" }, { state: "sent" }, { state: "retrying" }, { state: "failed" }])
    expect(c).toEqual({ pending: 0, retrying: 1, sent: 2, failed: 1 })
    expect(outboxHeadline(c)).toBe("1 email en échec définitif : à renvoyer ou à vérifier.")
    expect(outboxHeadline({ pending: 2, retrying: 1, sent: 0, failed: 0 })).toBe("3 emails en cours d'envoi.")
    expect(outboxHeadline({ pending: 0, retrying: 0, sent: 5, failed: 0 })).toBe("Tous les emails récents sont partis.")
  })
})

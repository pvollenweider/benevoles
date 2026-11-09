import { describe, it, expect } from "vitest"
import { outboxFailureGroup } from "../notifications/outbox-failure"
import type { SmtpOutcome, SmtpReason } from "../notifications/smtp-outcome"

/** The exact shape stored in NotificationOutbox.lastError (#598). */
const stored = (outcome: SmtpOutcome, reason: SmtpReason | null, code: number | null = 550, enhanced: string | null = null) =>
  `smtp:${outcome}:${reason ?? "-"}:${code ?? "-"}:${enhanced ?? "-"}`

describe("outboxFailureGroup", () => {
  it("groups every address reason as a recipient failure", () => {
    expect(outboxFailureGroup(stored("rejected_permanent", "mailbox_unknown", 550, "5.1.1"))).toBe("recipient")
    expect(outboxFailureGroup(stored("rejected_permanent", "mailbox_disabled", 550, "5.2.1"))).toBe("recipient")
    expect(outboxFailureGroup(stored("rejected_permanent", "domain_not_found", 550, "5.1.2"))).toBe("recipient")
  })

  it("keeps relay, policy, timeout and unknown reasons as other failures", () => {
    expect(outboxFailureGroup(stored("rejected_permanent", "policy_rejected", 550, "5.7.1"))).toBe("other")
    expect(outboxFailureGroup(stored("rejected_permanent", "relay_error", 550, "5.0.0"))).toBe("other")
    expect(outboxFailureGroup(stored("failed_temporary", "timeout", null))).toBe("other")
    expect(outboxFailureGroup(stored("failed_temporary", "other", 451, "4.7.1"))).toBe("other")
    // A full mailbox is temporary, not evidence that the address is mistyped.
    expect(outboxFailureGroup(stored("rejected_permanent", "mailbox_full", 550, "5.2.2"))).toBe("other")
    // An address reason under a temporary outcome is not a definitive address refusal.
    expect(outboxFailureGroup(stored("failed_temporary", "domain_not_found", 450, "4.1.2"))).toBe("other")
  })

  it("falls back to other for anything that is not a structured SMTP rejection", () => {
    expect(outboxFailureGroup("550 5.1.1 jane.doe@example.org: no such user")).toBe("other")
    expect(outboxFailureGroup("SMTP_HOST manquant : email non envoyé.")).toBe("other")
    expect(outboxFailureGroup("smtp:accepted_by_relay:-:-:-")).toBe("other")
    expect(outboxFailureGroup(null)).toBe("other")
    expect(outboxFailureGroup(undefined)).toBe("other")
    expect(outboxFailureGroup("")).toBe("other")
  })
})

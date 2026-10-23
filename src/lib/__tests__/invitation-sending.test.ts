import { describe, it, expect } from "vitest"
import { REMIND_COOLDOWN_MS, RESEND_GUARD_MS, emailedWithin, inviteEmailDedupeKey, lastInvitationEmailAt, manualReminderDedupeKey, sendCutoff } from "../invitation-sending"

const now = new Date("2026-10-23T12:00:00.000Z")
const ago = (ms: number) => new Date(now.getTime() - ms)
const H = 60 * 60 * 1000

describe("invitation sending rules (#1105)", () => {
  it("the window is 48 hours for a reminder and 5 minutes for a re-sent invitation", () => {
    expect(REMIND_COOLDOWN_MS).toBe(48 * H)
    expect(RESEND_GUARD_MS).toBe(5 * 60 * 1000)
  })

  it("the last email is the latest of the first invitation and the last re-send", () => {
    expect(lastInvitationEmailAt({ sentAt: ago(72 * H), lastRemindedAt: null })).toEqual(ago(72 * H))
    expect(lastInvitationEmailAt({ sentAt: ago(72 * H), lastRemindedAt: ago(10 * H) })).toEqual(ago(10 * H))
    expect(lastInvitationEmailAt({ sentAt: ago(1 * H).toISOString(), lastRemindedAt: ago(50 * H).toISOString() })).toEqual(ago(1 * H))
  })

  it("an invitation sent less than 48 hours ago counts as recent", () => {
    expect(emailedWithin({ sentAt: ago(47 * H) }, now)).toBe(true)
    expect(emailedWithin({ sentAt: ago(49 * H) }, now)).toBe(false)
  })

  it("a reminder less than 48 hours ago counts as recent, whatever the invitation's age", () => {
    expect(emailedWithin({ sentAt: ago(30 * 24 * H), lastRemindedAt: ago(48 * H - 1) }, now)).toBe(true)
    expect(emailedWithin({ sentAt: ago(30 * 24 * H), lastRemindedAt: ago(48 * H + 1) }, now)).toBe(false)
  })

  it("exactly 48 hours later, a reminder may go again (same edge as the claim's « < cutoff »)", () => {
    expect(emailedWithin({ sentAt: ago(48 * H) }, now)).toBe(false)
    expect(ago(48 * H) < sendCutoff(now, REMIND_COOLDOWN_MS)).toBe(false)
    expect(ago(48 * H + 1) < sendCutoff(now, REMIND_COOLDOWN_MS)).toBe(true)
  })

  it("dedupe keys are one per claim: same claim, same key; a later claim, a new key", () => {
    expect(inviteEmailDedupeKey("inv-1", now)).toBe(inviteEmailDedupeKey("inv-1", new Date(now)))
    expect(inviteEmailDedupeKey("inv-1", now)).not.toBe(inviteEmailDedupeKey("inv-1", ago(-1)))
    expect(inviteEmailDedupeKey("inv-1", now)).not.toBe(inviteEmailDedupeKey("inv-2", now))
    expect(manualReminderDedupeKey("evt-1", "vol-1", now)).toBe(`manual_reminder:evt-1:vol-1:${now.getTime()}`)
  })
})

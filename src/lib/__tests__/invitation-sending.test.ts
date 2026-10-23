import { describe, it, expect } from "vitest"
import { invitesWithEmailOutstanding, sameEmailKeyPrefix, manualReminderKeyPrefix, REMIND_COOLDOWN_MS, RESEND_GUARD_MS, emailedWithin, inviteEmailDedupeKey, lastInvitationEmailAt, manualReminderDedupeKey, sendCutoff } from "../invitation-sending"

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

  it("reads the invites with an email still in the outbox from the rows' keys", () => {
    const current = new Map<string, string | null>([["inv-1", "a@x.ch"], ["inv-2", "b@x.ch"], ["inv-3", "c@x.ch"]])
    const rows = [
      { dedupeKey: "member_invite:inv-1:123", email: "A@x.ch " },
      { dedupeKey: "member_invite:inv-2:456", email: null }, // unreadable: counted, never a second copy
      { dedupeKey: "member_invite:inv-3:789", email: "old@x.ch" }, // queued for an old address: cancelled at delivery
      { dedupeKey: "member_invite:inv-other:1", email: "z@x.ch" }, // not one of these invites
      { dedupeKey: "open-shifts:b:vol", email: "a@x.ch" },
      { dedupeKey: null, email: null },
      { dedupeKey: "manual_reminder:e:v:1", email: "a@x.ch" },
    ]
    expect(invitesWithEmailOutstanding(rows, current)).toEqual(new Set(["inv-1", "inv-2"]))
    expect(manualReminderDedupeKey("evt-1", "vol-1", now).startsWith(manualReminderKeyPrefix("evt-1"))).toBe(true)
    expect(inviteEmailDedupeKey("inv-9", now).startsWith("member_invite:inv-9:")).toBe(true)
  })

  it("groups the copies of the same email for « Renvoyer »: one invitation, one person's manual reminder", () => {
    expect(sameEmailKeyPrefix("member_invite:inv-1:123")).toBe("member_invite:inv-1:")
    expect(sameEmailKeyPrefix("manual_reminder:evt-1:vol-1:123")).toBe("manual_reminder:evt-1:vol-1:")
    expect(sameEmailKeyPrefix("open-shifts:batch:vol")).toBeNull()
    expect(sameEmailKeyPrefix("message:batch:vol")).toBeNull()
    expect(sameEmailKeyPrefix(null)).toBeNull()
    expect(sameEmailKeyPrefix("member_invite:")).toBeNull()
  })
})

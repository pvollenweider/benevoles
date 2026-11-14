import { describe, it, expect } from "vitest"
import {
  eventUsesCustomReminderRules,
  nextEventReminderPreview,
  nextReminderAttemptAt,
  reminderRuleDueAt,
  reminderRuleHours,
  reminderRuleStatus,
  rescheduleQueuedOccurrences,
  triggeredCustomReminders,
  validateReminderRules,
  type ReminderOccurrenceKey,
  type ReminderRuleInput,
  type ReminderRuleRegistration,
} from "../reminder-rules"
import { groupRemindersByDay, shiftLocalDay, type ReminderGroup } from "../reminder-groups"
import { localDateTimeToUtc } from "../time-zone"

const TZ = "Europe/Zurich"

function registration(over: {
  volunteerId?: string
  eventId?: string
  date?: string
  startTime?: string
  createdAt?: string
  id?: string
  /** Set to model a sign-up that went through the email confirmation (#1253). */
  confirmation?: { confirmedAt: string | null }
} = {}): ReminderRuleRegistration & { id: string } {
  return {
    id: over.id ?? "reg-1",
    volunteerId: over.volunteerId ?? "vol-1",
    eventId: over.eventId ?? "evt-1",
    createdAt: new Date(over.createdAt ?? "2030-01-01T00:00:00Z"),
    signupConfirmation: over.confirmation ? { confirmedAt: over.confirmation.confirmedAt ? new Date(over.confirmation.confirmedAt) : null } : null,
    shift: {
      date: new Date(over.date ?? "2030-06-01T00:00:00Z"),
      startTime: over.startTime ?? "10:00",
    },
  }
}

function groupsOf(regs: (ReminderRuleRegistration & { id: string })[], tz = TZ): ReminderGroup<ReminderRuleRegistration & { id: string }>[] {
  return groupRemindersByDay(regs, () => tz)
}

const rule = (over: Partial<ReminderRuleInput> = {}): ReminderRuleInput => ({
  id: "rule-1",
  unit: "hours",
  value: 2,
  enabled: true,
  ...over,
})

// 10:00 in Europe/Zurich on 2030-06-01 is 08:00Z (CEST); a 2 h rule is therefore due at 06:00Z.

describe("bounds and duplicate delays (#1139)", () => {
  it("accepts at most three rules", () => {
    const three = [rule({ id: "a" }), rule({ id: "b", value: 4 }), rule({ id: "c", value: 6 })]
    const four = [...three, rule({ id: "d", value: 8 })]
    expect(validateReminderRules(three).ok).toBe(true)
    expect(validateReminderRules(four)).toMatchObject({ ok: false, error: expect.stringContaining("plus de 3") })
  })

  it("bounds hours to 2–336 and days to 1–14, integer values only", () => {
    for (const value of [1, 337]) {
      expect(validateReminderRules([rule({ value })])).toMatchObject({ ok: false, error: expect.stringContaining("heures") })
    }
    for (const value of [0, 15]) {
      expect(validateReminderRules([rule({ unit: "days", value })])).toMatchObject({ ok: false, error: expect.stringContaining("jours") })
    }
    expect(validateReminderRules([rule({ value: 2 })]).ok).toBe(true)
    expect(validateReminderRules([rule({ value: 336 })]).ok).toBe(true)
    expect(validateReminderRules([rule({ unit: "days", value: 1 })]).ok).toBe(true)
    expect(validateReminderRules([rule({ unit: "days", value: 14 })]).ok).toBe(true)
    expect(validateReminderRules([rule({ value: 2.5 })])).toMatchObject({ ok: false, error: expect.stringContaining("entier") })
    expect(validateReminderRules([rule({ unit: "weeks", value: 1 })])).toMatchObject({ ok: false, error: expect.stringContaining("inconnue") })
  })

  it("refuses two rules with the same delay once converted to hours", () => {
    const result = validateReminderRules([
      rule({ id: "a", unit: "days", value: 2 }),
      rule({ id: "b", unit: "hours", value: 48 }),
    ])
    expect(result).toMatchObject({ ok: false, error: "Deux rappels ont le même délai : 48 heures." })
    // Distinct delays are fine, and displayOrder defaults to the input position.
    const ok = validateReminderRules([rule({ id: "a", unit: "days", value: 2 }), rule({ id: "b", unit: "hours", value: 2 })])
    expect(ok).toMatchObject({ ok: true, rules: [{ displayOrder: 0 }, { displayOrder: 1 }] })
  })

  it("converts a day to 24 elapsed hours", () => {
    expect(reminderRuleHours({ unit: "days", value: 1 })).toBe(24)
    expect(reminderRuleHours({ unit: "hours", value: 2 })).toBe(2)
    expect(reminderRuleHours({ unit: "weeks", value: 1 })).toBeNull()
  })
})

describe("replacement of the defaults (#1139)", () => {
  it("no rule row keeps the legacy path; any row, even disabled, switches to the event's rules", () => {
    expect(eventUsesCustomReminderRules([])).toBe(false)
    expect(eventUsesCustomReminderRules([rule({ enabled: false })])).toBe(true)
  })

  it("uses the event's rule, never the three legacy windows", () => {
    // 3 h before a shift, a 2 h rule is not due yet, whereas the legacy day-of window would be.
    const now = new Date("2030-06-01T05:00:00Z")
    const groups = groupsOf([registration({ startTime: "10:00" })])
    expect(triggeredCustomReminders(groups, [rule({ value: 2 })], now)).toEqual([])
  })

  it("all rules disabled: nothing due, the preview says so", () => {
    const now = new Date("2030-06-01T06:30:00Z")
    const groups = groupsOf([registration({ startTime: "10:00" })])
    const rules = [rule({ enabled: false }), rule({ id: "rule-2", value: 4, enabled: false })]
    expect(triggeredCustomReminders(groups, rules, now)).toEqual([])
    expect(nextEventReminderPreview({ rules, groups, now, eventRemindersEnabled: true })).toMatchObject({
      state: "blocked", reason: "no-enabled-rule",
    })
  })
})

describe("anchor and grouping (#1139)", () => {
  it("counts back from the earliest active shift of the volunteer, event and stored local day", () => {
    const now = new Date("2030-06-01T06:00:00Z")
    // Two shifts of the same day: the 09:00 one anchors the 2 h rule (due 05:00Z), even though 12:00 is later.
    const groups = groupsOf([
      registration({ id: "reg-late", startTime: "12:00" }),
      registration({ id: "reg-early", startTime: "09:00" }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].localDay).toBe("2030-06-01")
    const [trigger] = triggeredCustomReminders(groups, [rule({ value: 2 })], now)
    expect(trigger).toMatchObject({ dueAt: new Date("2030-06-01T05:00:00Z"), hours: 2 })
    expect(trigger.group.registrations.map((r) => r.id)).toEqual(["reg-early", "reg-late"])
  })

  it("keeps a shift past midnight on its stored start day", () => {
    const reg = registration({ date: "2030-06-01T00:00:00Z", startTime: "26:00" })
    expect(shiftLocalDay(reg.shift)).toBe("2030-06-01")
    const start = localDateTimeToUtc(reg.shift.date, reg.shift.startTime, TZ)
    expect(start.toISOString()).toBe("2030-06-02T00:00:00.000Z") // 02:00 CEST the next calendar day
    const groups = groupsOf([reg])
    expect(groups[0].localDay).toBe("2030-06-01")
    const now = new Date("2030-06-01T22:00:00Z")
    const [trigger] = triggeredCustomReminders(groups, [rule({ value: 2 })], now)
    expect(trigger.dueAt.toISOString()).toBe("2030-06-01T22:00:00.000Z")
  })
})

describe("DST in Europe/Zurich, both directions (#1139)", () => {
  it("spring forward: 24 elapsed hours across the missing hour", () => {
    // 2031-03-30 10:00 local is 08:00Z (CEST, +2); 24 h before is 08:00Z the day before (09:00 CET).
    const reg = registration({ date: "2031-03-30T00:00:00Z", startTime: "10:00" })
    const groups = groupsOf([reg])
    expect(groups[0].earliestStart.toISOString()).toBe("2031-03-30T08:00:00.000Z")
    const [trigger] = triggeredCustomReminders(groups, [rule({ unit: "days", value: 1 })], new Date("2031-03-29T08:00:00Z"))
    expect(trigger.dueAt.toISOString()).toBe("2031-03-29T08:00:00.000Z")
  })

  it("fall back: 24 elapsed hours across the repeated hour", () => {
    // 2031-10-26 10:00 local is 09:00Z (CET, +1); 24 h before is 09:00Z the day before (11:00 CEST).
    const reg = registration({ date: "2031-10-26T00:00:00Z", startTime: "10:00" })
    const groups = groupsOf([reg])
    expect(groups[0].earliestStart.toISOString()).toBe("2031-10-26T09:00:00.000Z")
    const [trigger] = triggeredCustomReminders(groups, [rule({ unit: "days", value: 1 })], new Date("2031-10-25T09:00:00Z"))
    expect(trigger.dueAt.toISOString()).toBe("2031-10-25T09:00:00.000Z")
  })
})

describe("late confirmations (#1139)", () => {
  it("a place confirmed after the due time skips that rule", () => {
    const now = new Date("2030-06-01T06:30:00Z")
    // 2 h rule due 06:00Z; the only place was recorded at 06:15Z.
    const groups = groupsOf([registration({ startTime: "10:00", createdAt: "2030-06-01T06:15:00Z" })])
    expect(reminderRuleStatus(groups[0], rule({ value: 2 }), now).status).toBe("late")
    expect(triggeredCustomReminders(groups, [rule({ value: 2 })], now)).toEqual([])
  })

  it("later rules of the event still apply to a place confirmed since", () => {
    const now = new Date("2030-06-01T06:30:00Z")
    const groups = groupsOf([registration({ startTime: "10:00", createdAt: "2030-06-01T05:30:00Z" })])
    // Confirmed at 05:30Z: the 1-day rule (due the day before) is skipped, the 2 h rule (06:00Z) applies.
    const rules = [rule({ id: "day", unit: "days", value: 1 }), rule({ id: "short", value: 2 })]
    expect(triggeredCustomReminders(groups, rules, now).map((t) => t.rule.id)).toEqual(["short"])
  })

  it("uses SignupConfirmation.confirmedAt, not the request date, when email confirmation happened", () => {
    const now = new Date("2030-06-01T07:30:00Z")
    // Requested on 1 May but confirmed at 07:00Z, after the 06:00Z due instant: late, not due.
    const late = groupsOf([registration({
      startTime: "10:00",
      createdAt: "2030-05-01T00:00:00Z",
      confirmation: { confirmedAt: "2030-06-01T07:00:00Z" },
    })])
    expect(reminderRuleStatus(late[0], rule({ value: 2 }), now).status).toBe("late")

    const onTime = groupsOf([registration({
      startTime: "10:00",
      createdAt: "2030-05-01T00:00:00Z",
      confirmation: { confirmedAt: "2030-06-01T05:00:00Z" },
    })])
    expect(reminderRuleStatus(onTime[0], rule({ value: 2 }), now).status).toBe("due")
  })

  it("falls back to createdAt for a place created active at once or a confirmation without a timestamp", () => {
    const now = new Date("2030-06-01T06:30:00Z")
    const noConfirmation = groupsOf([registration({ startTime: "10:00", createdAt: "2030-05-01T00:00:00Z" })])
    expect(reminderRuleStatus(noConfirmation[0], rule({ value: 2 }), now).status).toBe("due")

    const confirmationWithoutTimestamp = groupsOf([registration({
      startTime: "10:00", createdAt: "2030-05-01T00:00:00Z", confirmation: { confirmedAt: null },
    })])
    expect(reminderRuleStatus(confirmationWithoutTimestamp[0], rule({ value: 2 }), now).status).toBe("due")
  })

  it("one place confirmed in time keeps the group's rule due", () => {
    const now = new Date("2030-06-01T06:30:00Z")
    const groups = groupsOf([
      registration({ id: "early", startTime: "10:00", createdAt: "2030-05-01T00:00:00Z" }),
      registration({ id: "late", startTime: "11:00", createdAt: "2030-06-01T06:15:00Z" }),
    ])
    expect(triggeredCustomReminders(groups, [rule({ value: 2 })], now)).toHaveLength(1)
  })

  it("an occurrence due while the cron was down may still go out until the shift starts", () => {
    const groups = groupsOf([registration({ startTime: "10:00" })])
    // Due at 06:00Z, read at 07:59Z: still due.
    expect(triggeredCustomReminders(groups, [rule({ value: 2 })], new Date("2030-06-01T07:59:00Z"))).toHaveLength(1)
    // At the start instant, it is too late.
    expect(reminderRuleStatus(groups[0], rule({ value: 2 }), new Date("2030-06-01T08:00:00Z")).status).toBe("started")
  })
})

describe("shift moved earlier or later (#1139)", () => {
  it("moves the due instant with the earliest shift", () => {
    const r = rule({ value: 2 })
    const earlier = groupsOf([registration({ startTime: "09:00" })])[0]
    const later = groupsOf([registration({ startTime: "12:00" })])[0]
    expect(reminderRuleDueAt(earlier.earliestStart, 2)).toEqual(new Date("2030-06-01T05:00:00Z"))
    expect(reminderRuleDueAt(later.earliestStart, 2)).toEqual(new Date("2030-06-01T08:00:00Z"))
    // Moved later past now: not due yet instead of sending at the old time.
    const now = new Date("2030-06-01T06:30:00Z")
    expect(reminderRuleStatus(earlier, r, now).status).toBe("due")
    expect(reminderRuleStatus(later, r, now).status).toBe("not-yet")
  })
})

describe("cancellation emptying a group (#1139)", () => {
  it("no active registration leaves nothing due", () => {
    expect(triggeredCustomReminders([], [rule()], new Date("2030-06-01T06:30:00Z"))).toEqual([])
    expect(nextEventReminderPreview({
      rules: [rule()], groups: [], now: new Date("2030-06-01T06:30:00Z"), eventRemindersEnabled: true,
    })).toMatchObject({ state: "blocked", reason: "no-upcoming-reminder" })
  })
})

describe("sent suppression (#1139)", () => {
  const now = new Date("2030-06-01T06:00:00Z")
  const groups = groupsOf([registration({ startTime: "10:00" })])
  const key = (status: string): ReminderOccurrenceKey => ({
    eventId: "evt-1", volunteerId: "vol-1", localDay: "2030-06-01", ruleId: "rule-1", status,
  })

  it("a sent occurrence is never reopened", () => {
    expect(triggeredCustomReminders(groups, [rule()], now, [key("sent")])).toEqual([])
    expect(nextEventReminderPreview({ rules: [rule()], groups, now, occurrences: [key("sent")], eventRemindersEnabled: true }))
      .toMatchObject({ state: "blocked", reason: "no-upcoming-reminder" })
  })

  it("a queued occurrence is not claimed twice", () => {
    expect(triggeredCustomReminders(groups, [rule()], now, [key("queued")])).toEqual([])
    expect(nextEventReminderPreview({ rules: [rule()], groups, now, occurrences: [key("queued")], eventRemindersEnabled: true }))
      .toMatchObject({ state: "queued", ruleId: "rule-1", recipientCount: 1, shiftCount: 1 })
  })

  it("a cancelled occurrence is recomputed from the current registrations", () => {
    expect(triggeredCustomReminders(groups, [rule()], now, [key("cancelled")])).toHaveLength(1)
  })

  it("a failed occurrence is terminal and never reopened by the hourly run", () => {
    expect(triggeredCustomReminders(groups, [rule()], now, [key("failed")])).toEqual([])
    expect(nextEventReminderPreview({ rules: [rule()], groups, now, occurrences: [key("failed")], eventRemindersEnabled: true }))
      .toMatchObject({ state: "blocked", reason: "no-upcoming-reminder" })
  })
})

describe("queued occurrence schedule (#1139)", () => {
  it("recomputes a queued occurrence from the current shift so a move back earlier is not lost", () => {
    const groups = groupsOf([registration({ startTime: "10:00" })])
    const changes = rescheduleQueuedOccurrences(groups, [rule({ value: 2 })], [{
      eventId: "evt-1", volunteerId: "vol-1", localDay: "2030-06-01", ruleId: "rule-1",
      status: "queued", dueAt: new Date("2030-06-01T16:00:00Z"),
    }])
    expect(changes).toEqual([{
      eventId: "evt-1", volunteerId: "vol-1", localDay: "2030-06-01", ruleId: "rule-1",
      dueAt: new Date("2030-06-01T06:00:00Z"),
    }])
  })

  it("leaves sent, unqueued and unknown-rule occurrences alone", () => {
    const groups = groupsOf([registration({ startTime: "10:00" })])
    const base = { eventId: "evt-1", volunteerId: "vol-1", localDay: "2030-06-01", ruleId: "rule-1", dueAt: new Date("2030-06-01T16:00:00Z") }
    expect(rescheduleQueuedOccurrences(groups, [rule({ value: 2 })], [{ ...base, status: "sent" }])).toEqual([])
    expect(rescheduleQueuedOccurrences(groups, [rule({ value: 2, enabled: false })], [{ ...base, status: "queued" }])).toEqual([])
    expect(rescheduleQueuedOccurrences(groups, [rule({ value: 2 })], [{ ...base, status: "queued", ruleId: "other" }])).toEqual([])
  })
})

describe("preview evaluator (#1139)", () => {
  const now = new Date("2030-06-01T06:00:00Z")
  const groups = groupsOf([
    registration({ id: "a", volunteerId: "vol-1", startTime: "10:00" }),
    registration({ id: "b", volunteerId: "vol-2", startTime: "10:00" }),
    registration({ id: "c", volunteerId: "vol-1", startTime: "12:00" }),
  ])

  it("queued when due now, with the rule, instant and recipient counts", () => {
    expect(nextEventReminderPreview({ rules: [rule({ value: 2 })], groups, now, eventRemindersEnabled: true })).toEqual({
      state: "queued", reason: null, detail: null, ruleId: "rule-1",
      dueAt: new Date("2030-06-01T06:00:00Z"), localDay: "2030-06-01",
      recipientCount: 2, shiftCount: 3,
    })
  })

  it("scheduled when the next instance is still in the future", () => {
    const preview = nextEventReminderPreview({
      rules: [rule({ unit: "days", value: 1 })], groups, now: new Date("2030-05-31T06:00:00Z"), eventRemindersEnabled: true,
    })
    expect(preview).toMatchObject({ state: "scheduled", dueAt: new Date("2030-05-31T08:00:00Z"), recipientCount: 2, shiftCount: 3 })
  })

  it("blocked by the event switch or by the organisation verdict", () => {
    expect(nextEventReminderPreview({ rules: [rule()], groups, now, eventRemindersEnabled: false }))
      .toMatchObject({ state: "blocked", reason: "event-off" })
    expect(nextEventReminderPreview({ rules: [rule()], groups, now, eventRemindersEnabled: true, organizationBlockedReason: "Organisation désactivée" }))
      .toMatchObject({ state: "blocked", reason: "organization-blocked", detail: "Organisation désactivée" })
  })

  it("blocked when the event has no rule at all (legacy path)", () => {
    expect(nextEventReminderPreview({ rules: [], groups, now, eventRemindersEnabled: true }))
      .toMatchObject({ state: "blocked", reason: "no-rules" })
  })
})

describe("next reminder attempt against both deadlines (#1139)", () => {
  const due = new Date("2030-06-01T08:00:00Z")

  it("uses the due instant when there is no delivery constraint", () => {
    expect(nextReminderAttemptAt(due, null)).toEqual(due)
  })

  it("waits for a retry or hold that is later than the due instant", () => {
    const retry = new Date("2030-06-01T08:05:00Z")
    expect(nextReminderAttemptAt(due, retry)).toEqual(retry)
  })

  it("uses a later due instant, or the constraint when that is later still", () => {
    const later = new Date("2030-06-01T16:00:00Z")
    expect(nextReminderAttemptAt(later, null)).toEqual(later)
    expect(nextReminderAttemptAt(later, new Date("2030-06-01T17:00:00Z"))).toEqual(new Date("2030-06-01T17:00:00Z"))
    expect(nextReminderAttemptAt(later, new Date("2030-06-01T07:00:00Z"))).toEqual(later)
  })
})

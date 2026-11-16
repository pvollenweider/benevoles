import { describe, it, expect } from "vitest"
import { REMINDER_WINDOW_HOURS } from "../automatic-reminders"
import { eventUsesCustomReminderRules } from "../reminder-rules"
import { remindersDue, type GroupableRegistration } from "../reminder-groups"

/**
 * Regression guard for #1139: an event without any custom rule must keep exactly the legacy
 * candidates and windows. Nothing in `reminder-groups.ts`, `automatic-reminders.ts` or the
 * organisation switches changed; this pins the three windows and the grouping/triggering rules
 * the cron still uses for such an event.
 */

const TZ = "Europe/Zurich"

function reg(id: string, startTime: string, over: Partial<GroupableRegistration> = {}): GroupableRegistration & { id: string } {
  return {
    id,
    volunteerId: "vol-1",
    eventId: "evt-1",
    shift: { date: new Date("2030-06-01T00:00:00Z"), startTime },
    ...over,
  }
}

function inWindow(key: "j2" | "j1" | "dd", now: string) {
  const { minHours, maxHours } = REMINDER_WINDOW_HOURS[key]
  const at = new Date(now)
  return remindersDue(
    [reg("early", "10:00"), reg("late", "12:00")],
    () => TZ,
    new Date(at.getTime() + minHours * 3_600_000),
    new Date(at.getTime() + maxHours * 3_600_000),
  )
}

describe("legacy reminder path for an event without rules (#1139)", () => {
  it("keeps the three windows byte for byte", () => {
    expect(REMINDER_WINDOW_HOURS).toEqual({
      j2: { minHours: 47, maxHours: 49 },
      j1: { minHours: 23, maxHours: 25 },
      dd: { minHours: 2, maxHours: 4 },
    })
  })

  it("an event without rules is not a custom-rules event", () => {
    expect(eventUsesCustomReminderRules([])).toBe(false)
  })

  it("still groups by volunteer, event and local day, anchored on the earliest shift", () => {
    for (const [key, now] of [
      ["j2", "2030-05-30T09:00:00Z"],
      ["j1", "2030-05-31T09:00:00Z"],
      ["dd", "2030-06-01T06:00:00Z"],
    ] as const) {
      const groups = inWindow(key, now)
      expect(groups).toHaveLength(1)
      expect(groups[0].localDay).toBe("2030-06-01")
      expect(groups[0].registrations.map((r) => r.id)).toEqual(["early", "late"])
      expect(groups[0].earliestStart.toISOString()).toBe("2030-06-01T08:00:00.000Z")
    }
  })

  it("keeps the legacy late-sign-up behaviour: a shift already past the window lower bound is left out", () => {
    // Day-of window at 08:00–10:00Z, but the shift starts at 09:00Z (already before the lower bound
    // 10:00Z): the legacy path sends nothing for it, as before.
    const now = new Date("2030-06-01T08:00:00Z")
    const groups = remindersDue(
      [reg("late", "09:00")],
      () => TZ,
      new Date(now.getTime() + 2 * 3_600_000),
      new Date(now.getTime() + 4 * 3_600_000),
    )
    expect(groups).toEqual([])
  })
})

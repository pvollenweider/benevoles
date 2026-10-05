// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { groupRemindersByDay, groupsInWindow, remindersDue, shiftLocalDay, shiftStartInstant, type GroupableRegistration } from "../reminder-groups"

const TZ = "Europe/Zurich"

type Reg = GroupableRegistration & { id: string }

const reg = (id: string, opts: Partial<{ volunteerId: string; eventId: string; date: string; startTime: string }> = {}): Reg => ({
  id,
  volunteerId: opts.volunteerId ?? "vol-1",
  eventId: opts.eventId ?? "event-1",
  shift: { date: new Date(`${opts.date ?? "2026-06-13"}T00:00:00Z`), startTime: opts.startTime ?? "09:00" },
})

const allTz = () => TZ

describe("groupRemindersByDay", () => {
  it("groups several shifts of the same volunteer, event and day together", () => {
    const candidates = [
      reg("a", { startTime: "09:00" }),
      reg("b", { startTime: "14:00" }),
      reg("c", { startTime: "11:00" }),
    ]
    const groups = groupRemindersByDay(candidates, allTz)
    expect(groups).toHaveLength(1)
    expect(groups[0].registrations.map((r) => r.id)).toEqual(["a", "c", "b"]) // sorted by start
    expect(groups[0].earliestStart).toEqual(shiftStartInstant(candidates[0].shift, TZ))
  })

  it("splits shifts on different days into separate groups", () => {
    const candidates = [reg("a", { date: "2026-06-13" }), reg("b", { date: "2026-06-14" })]
    const groups = groupRemindersByDay(candidates, allTz)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.localDay).sort()).toEqual(["2026-06-13", "2026-06-14"])
  })

  it("splits shifts of the same volunteer and day but different events into separate groups (one email per event)", () => {
    const candidates = [reg("a", { eventId: "event-1" }), reg("b", { eventId: "event-2" })]
    const groups = groupRemindersByDay(candidates, allTz)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.eventId).sort()).toEqual(["event-1", "event-2"])
  })

  it("splits shifts of different volunteers into separate groups", () => {
    const candidates = [reg("a", { volunteerId: "vol-1" }), reg("b", { volunteerId: "vol-2" })]
    const groups = groupRemindersByDay(candidates, allTz)
    expect(groups).toHaveLength(2)
  })

  it("counts a night shift on its start day (owner decision)", () => {
    // 22:00 to 02:00 (26:00): the shift's `date` column is the start day, same as shiftInstants (ics.ts).
    const night = reg("night", { date: "2026-06-13", startTime: "22:00" })
    expect(shiftLocalDay(night.shift)).toBe("2026-06-13")
    const groups = groupRemindersByDay([night, reg("same-day", { date: "2026-06-13", startTime: "08:00" })], allTz)
    expect(groups).toHaveLength(1)
    expect(groups[0].localDay).toBe("2026-06-13")
  })

  it("handles the DST spring-forward day in Europe/Zurich (2026-03-29, 2:00 -> 3:00)", () => {
    const candidates = [
      reg("early", { date: "2026-03-29", startTime: "01:00" }),
      reg("late", { date: "2026-03-29", startTime: "10:00" }),
    ]
    const groups = groupRemindersByDay(candidates, allTz)
    expect(groups).toHaveLength(1)
    expect(groups[0].registrations.map((r) => r.id)).toEqual(["early", "late"])
    expect(groups[0].earliestStart < shiftStartInstant(candidates[1].shift, TZ)).toBe(true)
  })

  it("handles the DST fall-back day in Europe/Zurich (2026-10-25, 3:00 -> 2:00)", () => {
    const candidates = [
      reg("early", { date: "2026-10-25", startTime: "01:00" }),
      reg("late", { date: "2026-10-25", startTime: "10:00" }),
    ]
    const groups = groupRemindersByDay(candidates, allTz)
    expect(groups).toHaveLength(1)
    expect(groups[0].registrations.map((r) => r.id)).toEqual(["early", "late"])
  })

  it("a late sign-up after its day's group was already sent forms its own group of one", () => {
    // Simulates the cron's candidate query: the two already-sent shifts never appear again
    // (their reminder*Sent field is no longer null), only the late one remains a candidate.
    const candidates = [reg("late-signup", { date: "2026-06-13", startTime: "18:00" })]
    const groups = groupRemindersByDay(candidates, allTz)
    expect(groups).toHaveLength(1)
    expect(groups[0].registrations).toHaveLength(1)
  })

  it("excludes a cancelled shift from the group without affecting the rest (filtered upstream)", () => {
    // The cron's query already excludes shift.status === "cancelled"; a cancelled shift simply
    // never reaches `candidates`, so the remaining shifts of the day still form a correct group.
    const candidates = [reg("a", { startTime: "09:00" }), reg("c", { startTime: "15:00" })] // "b" (cancelled) absent
    const groups = groupRemindersByDay(candidates, allTz)
    expect(groups).toHaveLength(1)
    expect(groups[0].registrations.map((r) => r.id)).toEqual(["a", "c"])
  })

  it("keeps a shift just before local midnight on its own day, not the next UTC day", () => {
    // 2026-06-13 23:30 Europe/Zurich (CEST, UTC+2) is 2026-06-13 21:30Z: same UTC calendar day here,
    // but the boundary that matters is the stored `date` column, not the instant's day.
    const lateNight = reg("late-night", { date: "2026-06-13", startTime: "23:30" })
    expect(shiftLocalDay(lateNight.shift)).toBe("2026-06-13")
  })
})

describe("groupsInWindow", () => {
  it("triggers a group when its earliest shift enters the window, even if later shifts would enter it later", () => {
    const candidates = [
      reg("a", { startTime: "09:00" }), // earliest
      reg("b", { startTime: "20:00" }), // same day, later start
    ]
    const groups = groupRemindersByDay(candidates, allTz)
    const earliest = groups[0].earliestStart
    const lower = new Date(earliest.getTime() - 1000)
    const upper = new Date(earliest.getTime() + 1000)
    const triggered = groupsInWindow(groups, lower, upper)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].registrations).toHaveLength(2) // both shifts included
  })

  it("does not trigger a group whose earliest shift is outside the window", () => {
    const candidates = [reg("a", { startTime: "09:00" })]
    const groups = groupRemindersByDay(candidates, allTz)
    const earliest = groups[0].earliestStart
    const triggered = groupsInWindow(groups, new Date(earliest.getTime() + 3600_000), new Date(earliest.getTime() + 7200_000))
    expect(triggered).toHaveLength(0)
  })
})

describe("remindersDue", () => {
  // Day-of window is 2–4 h before the start. Sign-up at 10:00 local on the day for 11:00 and 16:00.
  const at = (hhmm: string) => shiftStartInstant({ date: new Date("2026-06-13T00:00:00Z"), startTime: hhmm }, TZ)
  const window = (now: Date) => [new Date(now.getTime() + 2 * 3600_000), new Date(now.getTime() + 4 * 3600_000)] as const

  it("still reminds the later shift when the earliest of the day is already past its window (regression)", () => {
    const candidates = [reg("early", { startTime: "11:00" }), reg("late", { startTime: "16:00" })]
    // 13:00: the 16:00 shift enters its 2–4 h window; the 11:00 one can no longer get a day-of reminder.
    const [lower, upper] = window(at("13:00"))
    const due = remindersDue(candidates, allTz, lower, upper)
    expect(due).toHaveLength(1)
    expect(due[0].registrations.map((r) => r.id)).toEqual(["late"])
  })

  it("keeps grouping the shifts of the day that are all still ahead of the window", () => {
    const candidates = [reg("a", { startTime: "11:00" }), reg("b", { startTime: "16:00" })]
    const [lower, upper] = window(at("08:00"))
    const due = remindersDue(candidates, allTz, lower, upper)
    expect(due).toHaveLength(1)
    expect(due[0].registrations.map((r) => r.id)).toEqual(["a", "b"])
  })

  it("sends nothing while no group's earliest remaining shift is in the window", () => {
    const candidates = [reg("a", { startTime: "16:00" })]
    const [lower, upper] = window(at("08:00"))
    expect(remindersDue(candidates, allTz, lower, upper)).toHaveLength(0)
  })
})

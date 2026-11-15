import { describe, it, expect } from "vitest"
import {
  lastMessageSentence,
  nextAutomaticReminder,
  nextCustomReminderFromPreview,
  nextLegacyReminder,
  placesSentence,
} from "../event-overview"
import type { RemindersState } from "../automatic-reminders"
import type { CustomReminderPreviewView } from "../reminder-rules"

describe("placesSentence", () => {
  it("says the places in words, requests only when there are some", () => {
    expect(placesSentence({ capacity: 48, confirmed: 30, requested: 2, left: 16 })).toBe("30 personnes confirmées, 2 demandes à traiter, 16 places encore libres.")
    expect(placesSentence({ capacity: 4, confirmed: 1, requested: 0, left: 1 })).toBe("1 personne confirmée, 1 place encore libre.")
    expect(placesSentence({ capacity: 4, confirmed: 4, requested: 0, left: 0 })).toBe("4 personnes confirmées, plus aucune place libre.")
    expect(placesSentence({ capacity: 0, confirmed: 0, requested: 0, left: 0 })).toBeNull()
  })
})

describe("nextAutomaticReminder", () => {
  const tz = "Europe/Paris"
  const shifts = [
    { date: "2030-07-05", startTime: "14:00", endTime: "16:00" },
    { date: "2030-07-05", startTime: "09:00", endTime: "11:00" },
    { date: "2030-07-06", startTime: "10:00", endTime: "12:00" },
  ]
  const all = ["j2", "j1", "dd"] as const

  it("the J-2 of the first day when it is still ahead", () => {
    expect(nextAutomaticReminder(shifts, [...all], new Date("2030-07-01T08:00:00Z"), tz)).toEqual({ key: "j2", label: "Rappel J-2", day: "2030-07-03" })
  })

  it("the next one once J-2 has gone, from the day's first shift", () => {
    // 5 July 09:00 Paris = 07:00Z; J-1 window closes 23 h before (4 July 08:00Z).
    expect(nextAutomaticReminder(shifts, [...all], new Date("2030-07-03T12:00:00Z"), tz)).toEqual({ key: "j1", label: "Rappel J-1", day: "2030-07-04" })
    // J-1 of the first day closed at 08:00Z; the J-2 of the second day (window until 09:00Z) is next.
    expect(nextAutomaticReminder(shifts, [...all], new Date("2030-07-04T08:30:00Z"), tz)?.key).toBe("j2")
  })

  it("only the reminders that are on; nothing once every window is over", () => {
    expect(nextAutomaticReminder(shifts, ["dd"], new Date("2030-07-01T08:00:00Z"), tz)).toEqual({ key: "dd", label: "Rappel du jour", day: "2030-07-05" })
    expect(nextAutomaticReminder(shifts, [...all], new Date("2030-07-06T08:00:00Z"), tz)).toBeNull()
    expect(nextAutomaticReminder([], [...all], new Date("2030-07-01T08:00:00Z"), tz)).toBeNull()
  })
})

describe("lastMessageSentence", () => {
  it("subject, day in the organisation's zone, recipients", () => {
    expect(lastMessageSentence({ subject: "Infos parking", createdAt: new Date("2030-10-02T23:30:00Z"), recipientCount: 25 }, "Europe/Paris"))
      .toBe("« Infos parking », le 3 octobre, à 25 personnes.")
    expect(lastMessageSentence({ subject: "Merci", createdAt: new Date("2030-10-02T10:00:00Z"), recipientCount: 1 }, "Europe/Paris")).toContain("à 1 personne.")
  })
})


describe("nextLegacyReminder (#705, #1139)", () => {
  const tz = "Europe/Paris"
  const shifts = [{ date: "2030-07-05", startTime: "09:00", endTime: "11:00" }]

  it("still computes the line when only some organisation switches are on", () => {
    const partly: RemindersState = { kind: "partly-off", on: ["dd"], off: ["j2", "j1"] }
    // 09:00 Paris = 07:00Z; the day-of window opens 2 h before, so 04:00Z is inside it.
    expect(nextLegacyReminder(partly, shifts, new Date("2030-07-05T04:00:00Z"), tz))
      .toEqual({ key: "dd", label: "Rappel du jour", day: "2030-07-05" })
    expect(nextLegacyReminder({ kind: "on", on: ["j2", "j1", "dd"], off: [] }, shifts, new Date("2030-07-01T08:00:00Z"), tz)?.key).toBe("j2")
    expect(nextLegacyReminder({ kind: "org-off", on: [], off: ["j2", "j1", "dd"] }, shifts, new Date("2030-07-01T08:00:00Z"), tz)).toBeNull()
  })
})

describe("nextCustomReminderFromPreview (#1139)", () => {
  const rules = [
    { id: "r1", unit: "days" as const, value: 7, enabled: true },
    { id: "r2", unit: "hours" as const, value: 2, enabled: true },
  ]
  const preview = (over: Partial<CustomReminderPreviewView> = {}): CustomReminderPreviewView => ({
    state: "scheduled", reason: null, detail: null, ruleId: "r2", dueAt: "2030-07-05T14:00:00.000Z",
    localDay: "2030-07-05", recipientCount: 1, shiftCount: 1, ...over,
  }) as CustomReminderPreviewView

  it("takes the rule's words and the day of the send instant from the shared preview", () => {
    expect(nextCustomReminderFromPreview(preview(), rules, "Europe/Paris"))
      .toEqual({ key: "rule-r2", label: "2 heures avant", day: "2030-07-05" })
    expect(nextCustomReminderFromPreview(preview({ localDay: "2030-07-06", dueAt: "2030-07-05T23:30:00.000Z" }), rules, "Europe/Paris"))
      .toEqual({ key: "rule-r2", label: "2 heures avant", day: "2030-07-06" })
  })

  it("shows nothing when the preview is blocked or the rule is gone", () => {
    expect(nextCustomReminderFromPreview(preview({ state: "blocked", reason: "event-unpublished", ruleId: null, dueAt: null, localDay: null, recipientCount: 0, shiftCount: 0 }), rules, "Europe/Paris")).toBeNull()
    expect(nextCustomReminderFromPreview(preview({ ruleId: "gone" }), rules, "Europe/Paris")).toBeNull()
  })
})

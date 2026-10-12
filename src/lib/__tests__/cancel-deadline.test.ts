import { describe, it, expect } from "vitest"
import {
  cancelClosedText, cancelContacts, cancelDeadlineFormErrors, cancelDeadlineFormFrom, cancelDeadlineLabel, cancelDeadlinePayload,
  cancelPolicySentence, cancelRefusedError, cancelUntilText, hasEarlierDeadline, isLateWithdrawal, reminderCancelNotice,
  selfCancelDeadline, selfCancelState, shiftEndsAt, shiftStartsAt,
} from "../cancel-deadline"
import { cancelDeadlineSchema } from "../cancel-deadline-schema"
import { z } from "zod"

// Volunteer self-cancellation (#946): until the shift starts by default, an optional earlier
// deadline for a confirmed place, computed per shift in the organisation's zone.

const ZH = "Europe/Zurich"
// Saturday 4 July 2026, 10:00 to 12:00 in Zurich (summer time, UTC+2): starts at 08:00 UTC.
const shift = { date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" }
const at = (iso: string) => new Date(iso)
const state = (status: string, now: string, setting = {}, s = shift, timeZone = ZH) => selfCancelState({ status, shift: s, setting, timeZone, now: at(now) })

describe("shiftStartsAt / shiftEndsAt", () => {
  it("reads the wall-clock time in the organisation's zone", () => {
    expect(shiftStartsAt(shift, ZH).toISOString()).toBe("2026-07-04T08:00:00.000Z")
    expect(shiftStartsAt(shift, "America/New_York").toISOString()).toBe("2026-07-04T14:00:00.000Z")
    expect(shiftStartsAt(shift, "UTC").toISOString()).toBe("2026-07-04T10:00:00.000Z")
  })

  it("accepts the calendar day as the ISO string the API sends", () => {
    expect(shiftStartsAt({ ...shift, date: "2026-07-04T00:00:00.000Z" }, ZH).toISOString()).toBe("2026-07-04T08:00:00.000Z")
  })

  it("ends an overnight shift the next morning", () => {
    const night = { date: new Date("2026-07-04T00:00:00Z"), startTime: "22:00", endTime: "02:00" }
    expect(shiftStartsAt(night, ZH).toISOString()).toBe("2026-07-04T20:00:00.000Z")
    expect(shiftEndsAt(night, ZH).toISOString()).toBe("2026-07-05T00:00:00.000Z")
  })
})

describe("selfCancelState", () => {
  it("without an earlier deadline: allowed until the start, never after", () => {
    expect(state("active", "2026-07-04T07:59:59Z")).toEqual({ allowed: true, deadline: null })
    expect(state("active", "2026-07-04T08:00:00Z")).toEqual({ allowed: false, reason: "started" })
    expect(state("active", "2026-07-04T09:59:00Z")).toEqual({ allowed: false, reason: "started" })
    expect(state("active", "2026-07-04T10:00:00Z")).toEqual({ allowed: false, reason: "ended" })
    expect(state("active", "2026-09-01T00:00:00Z")).toEqual({ allowed: false, reason: "ended" })
  })

  it("deadline 0 (days and hours) is the same as none", () => {
    expect(state("active", "2026-07-04T07:59:00Z", { cancelDeadlineDays: 0, cancelDeadlineHours: 0 })).toEqual({ allowed: true, deadline: null })
    expect(state("active", "2026-07-04T08:00:00Z", { cancelDeadlineDays: 0, cancelDeadlineHours: 0 })).toEqual({ allowed: false, reason: "started" })
  })

  it("an earlier deadline: allowed before it, refused from it, with its date", () => {
    const setting = { cancelDeadlineDays: 2 }
    expect(state("active", "2026-07-02T07:59:00Z", setting)).toEqual({ allowed: true, deadline: at("2026-07-02T08:00:00Z") })
    expect(state("active", "2026-07-02T08:00:00Z", setting)).toEqual({ allowed: false, reason: "deadline" })
    expect(state("active", "2026-07-04T07:00:00Z", setting)).toEqual({ allowed: false, reason: "deadline" })
    // Past the start, the start wins: « a commencé », not « délai passé ».
    expect(state("active", "2026-07-04T08:30:00Z", setting)).toEqual({ allowed: false, reason: "started" })
  })

  it("days and hours add up", () => {
    expect(selfCancelDeadline(shift, { cancelDeadlineDays: 1, cancelDeadlineHours: 6 }, ZH).toISOString()).toBe("2026-07-03T02:00:00.000Z")
    expect(selfCancelDeadline(shift, { cancelDeadlineHours: 12 }, ZH).toISOString()).toBe("2026-07-03T20:00:00.000Z")
  })

  it("waitlist entries, offered spots and pending requests stop only at the start", () => {
    const setting = { cancelDeadlineDays: 2 }
    for (const status of ["waiting", "offered", "requested"]) {
      expect(state(status, "2026-07-03T08:00:00Z", setting)).toEqual({ allowed: true, deadline: null })
      expect(state(status, "2026-07-04T08:00:00Z", setting)).toEqual({ allowed: false, reason: "started" })
    }
  })

  it("an overnight shift: the start decides, the next morning is « terminé »", () => {
    const night = { date: new Date("2026-07-04T00:00:00Z"), startTime: "22:00", endTime: "02:00" }
    expect(state("active", "2026-07-04T19:59:00Z", {}, night)).toEqual({ allowed: true, deadline: null })
    expect(state("active", "2026-07-04T23:00:00Z", {}, night)).toEqual({ allowed: false, reason: "started" })
    expect(state("active", "2026-07-05T00:00:00Z", {}, night)).toEqual({ allowed: false, reason: "ended" })
    // 6 hours before 22:00 is 16:00 the same day.
    expect(state("active", "2026-07-04T14:00:00Z", { cancelDeadlineHours: 6 }, night)).toEqual({ allowed: false, reason: "deadline" })
  })

  it("a shift just after midnight belongs to its own date", () => {
    const early = { date: new Date("2026-07-05T00:00:00Z"), startTime: "00:30", endTime: "04:00" }
    expect(shiftStartsAt(early, ZH).toISOString()).toBe("2026-07-04T22:30:00.000Z")
    expect(state("active", "2026-07-04T22:00:00Z", {}, early)).toEqual({ allowed: true, deadline: null })
  })

  it("follows the organisation's zone", () => {
    // 10:00 in New York is 14:00 UTC, in Zurich 08:00 UTC: at 09:00 UTC it has only started in Zurich.
    expect(state("active", "2026-07-04T09:00:00Z", {}, shift, "America/New_York")).toEqual({ allowed: true, deadline: null })
    expect(state("active", "2026-07-04T09:00:00Z", {}, shift, ZH)).toEqual({ allowed: false, reason: "started" })
  })

  it("counts days as calendar days across a daylight-saving change (same wall-clock time)", () => {
    // Monday 30 March 2026, 10:00 in Zurich (summer time); 2 days before = Saturday 28 March, 10:00 winter time.
    const afterChange = { date: new Date("2026-03-30T00:00:00Z"), startTime: "10:00", endTime: "12:00" }
    expect(selfCancelDeadline(afterChange, { cancelDeadlineDays: 2 }, ZH).toISOString()).toBe("2026-03-28T09:00:00.000Z")
  })
})

describe("isLateWithdrawal", () => {
  const start = at("2026-07-04T08:00:00Z")
  it("is late less than 24 hours before the start, not before nor after it", () => {
    expect(isLateWithdrawal(start, at("2026-07-03T08:00:01Z"))).toBe(true)
    expect(isLateWithdrawal(start, at("2026-07-04T07:59:00Z"))).toBe(true)
    expect(isLateWithdrawal(start, at("2026-07-03T08:00:00Z"))).toBe(false)
    expect(isLateWithdrawal(start, at("2026-07-01T08:00:00Z"))).toBe(false)
    expect(isLateWithdrawal(start, at("2026-07-04T08:00:00Z"))).toBe(false)
  })
})

describe("words", () => {
  it("labels the deadline", () => {
    expect(cancelDeadlineLabel({})).toBeNull()
    expect(cancelDeadlineLabel({ cancelDeadlineDays: 1 })).toBe("1 jour")
    expect(cancelDeadlineLabel({ cancelDeadlineDays: 2, cancelDeadlineHours: 1 })).toBe("2 jours et 1 heure")
    expect(cancelDeadlineLabel({ cancelDeadlineHours: 12 })).toBe("12 heures")
    expect(hasEarlierDeadline({ cancelDeadlineDays: 0, cancelDeadlineHours: null })).toBe(false)
  })

  it("states the policy only when an earlier deadline is set", () => {
    expect(cancelPolicySentence({})).toBeNull()
    expect(cancelPolicySentence({ cancelDeadlineDays: 2 })).toBe("Tu peux annuler toi-même jusqu'à 2 jours avant le début de chaque créneau. Passé ce délai, préviens l'organisation.")
  })

  it("says the date in the organisation's zone", () => {
    expect(cancelUntilText(at("2026-07-02T08:00:00Z"), ZH)).toBe("Tu peux annuler toi-même jusqu'au jeudi 2 juillet à 10:00.")
  })

  it("explains why the button is gone and why the server refused", () => {
    expect(cancelClosedText("started")).toContain("a commencé")
    expect(cancelClosedText("ended")).toBe("Ce créneau est terminé.")
    expect(cancelClosedText("deadline")).toContain("délai")
    expect(cancelRefusedError("deadline")).toContain("rien n'a été annulé")
    expect(cancelRefusedError("started")).toContain("a déjà commencé")
  })

  it("words the reminder: the date while ahead, the contacts once past, nothing by default", () => {
    expect(reminderCancelNotice(shift, {}, ZH, at("2026-07-02T06:00:00Z"))).toBeNull()
    expect(reminderCancelNotice(shift, { cancelDeadlineDays: 1 }, ZH, at("2026-07-02T08:00:00Z"))).toBe("Tu peux annuler toi-même jusqu'au vendredi 3 juillet à 10:00. Passé ce délai, préviens l'organisation.")
    expect(reminderCancelNotice(shift, { cancelDeadlineDays: 2 }, ZH, at("2026-07-03T08:00:00Z"))).toContain("est passé")
  })
})

describe("cancelContacts", () => {
  it("lists the sector leaders, then the on-site contact, then the organisation's email", () => {
    expect(cancelContacts({ sectorLeaderNames: ["Paul"], dayContactName: "Léa", dayContactPhone: "079 000 00 00" }, "orga@example.org")).toEqual([
      { label: "Responsable du poste", text: "Paul" },
      { label: "Contact le jour J", text: "Léa, 079 000 00 00", href: "tel:0790000000" },
      { label: "Écrire à l'organisation", text: "orga@example.org", href: "mailto:orga@example.org" },
    ])
  })

  it("is empty without any contact", () => {
    expect(cancelContacts({}, null)).toEqual([])
  })
})

describe("settings form", () => {
  it("reads the stored setting", () => {
    expect(cancelDeadlineFormFrom({ cancelDeadlineDays: null, cancelDeadlineHours: null })).toEqual({ mode: "start", days: "", hours: "" })
    expect(cancelDeadlineFormFrom({ cancelDeadlineDays: 2, cancelDeadlineHours: null })).toEqual({ mode: "before", days: "2", hours: "" })
  })

  it("validates the fields and builds the body", () => {
    expect(cancelDeadlineFormErrors({ mode: "start", days: "x", hours: "" })).toEqual({})
    expect(cancelDeadlinePayload({ mode: "start", days: "3", hours: "" })).toEqual({ cancelDeadlineDays: null, cancelDeadlineHours: null })
    expect(cancelDeadlinePayload({ mode: "before", days: "2", hours: "" })).toEqual({ cancelDeadlineDays: 2, cancelDeadlineHours: null })
    expect(cancelDeadlinePayload({ mode: "before", days: "", hours: "6" })).toEqual({ cancelDeadlineDays: null, cancelDeadlineHours: 6 })
    expect(Object.keys(cancelDeadlineFormErrors({ mode: "before", days: "61", hours: "" }))).toEqual(["days"])
    expect(Object.keys(cancelDeadlineFormErrors({ mode: "before", days: "1.5", hours: "" }))).toEqual(["days"])
    expect(Object.keys(cancelDeadlineFormErrors({ mode: "before", days: "", hours: "24" }))).toEqual(["hours"])
    expect(cancelDeadlineFormErrors({ mode: "before", days: "", hours: "0" }).total).toContain("au moins un jour ou une heure")
    expect(cancelDeadlinePayload({ mode: "before", days: "", hours: "" })).toBeNull()
  })

  it("the API schema stores 0 as null and refuses out-of-range values", () => {
    const schema = z.object(cancelDeadlineSchema)
    expect(schema.parse({ cancelDeadlineDays: 0, cancelDeadlineHours: 5 })).toEqual({ cancelDeadlineDays: null, cancelDeadlineHours: 5 })
    expect(schema.parse({})).toEqual({})
    expect(schema.safeParse({ cancelDeadlineHours: 24 }).success).toBe(false)
    expect(schema.safeParse({ cancelDeadlineDays: 61 }).success).toBe(false)
  })
})

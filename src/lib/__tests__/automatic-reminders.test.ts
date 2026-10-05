import { describe, it, expect } from "vitest"
import { REMINDER_WINDOW_HOURS, reminderTiming, remindersState, remindersSummary } from "../automatic-reminders"

const facts = (over: Partial<Parameters<typeof remindersSummary>[0]> = {}): Parameters<typeof remindersSummary>[0] => ({
  eventId: "evt-1", published: true, eventEnabled: true, upcomingShifts: true,
  organization: { j2: true, j1: true, dd: true },
  ...over,
})

const EVENT_LINK = { href: "/admin/events/evt-1/edit#event-reminders", label: "Rappels automatiques de l'événement" }
const SETTINGS_LINK = { href: "/admin/settings/notifications", label: "Réglages des emails de l'organisation" }

/** Every piece of copy of a summary, to check the admin style rules on all of it. */
const allText = (s: ReturnType<typeof remindersSummary>) =>
  [s.title, ...s.notes, ...s.sent.flatMap((x) => [x.label, x.timing]), ...s.links.map((l) => l.label)].join("\n")

describe("reminder timing", () => {
  it("words the cron windows (#672): around 48 h, around 24 h, 2 to 4 h before the first shift of the day", () => {
    expect(REMINDER_WINDOW_HOURS).toEqual({ j2: { minHours: 47, maxHours: 49 }, j1: { minHours: 23, maxHours: 25 }, dd: { minHours: 2, maxHours: 4 } })
    expect(reminderTiming("j2")).toBe("environ 48 h avant le premier créneau du jour")
    expect(reminderTiming("j1")).toBe("environ 24 h avant le premier créneau du jour")
    expect(reminderTiming("dd")).toBe("2 à 4 h avant le premier créneau du jour")
  })
})

describe("reminders state", () => {
  it("reads no future shift first, then the event, then the organization", () => {
    expect(remindersState({ ...facts(), upcomingShifts: false, eventEnabled: false })).toEqual({ kind: "no-upcoming-shift" })
    expect(remindersState({ ...facts(), eventEnabled: false, organization: { j2: false, j1: false, dd: false } })).toEqual({ kind: "event-off" })
    expect(remindersState(facts())).toEqual({ kind: "on", on: ["j2", "j1", "dd"], off: [] })
    expect(remindersState(facts({ organization: { j2: false, j1: true, dd: false } }))).toEqual({ kind: "partly-off", on: ["j1"], off: ["j2", "dd"] })
    expect(remindersState(facts({ organization: { j2: false, j1: false, dd: false } }))).toEqual({ kind: "org-off", on: [], off: ["j2", "j1", "dd"] })
  })
})

describe("reminders box (#705)", () => {
  it("all on: the three reminders with their timing, the grouping per day, both links", () => {
    const s = remindersSummary(facts())
    expect(s).toMatchObject({ state: "on", ok: true, title: "Rappels automatiques activés" })
    expect(s.sent.map((x) => `${x.label} : ${x.timing}`)).toEqual([
      "Rappel J-2 : environ 48 h avant le premier créneau du jour",
      "Rappel J-1 : environ 24 h avant le premier créneau du jour",
      "Rappel du jour : 2 à 4 h avant le premier créneau du jour",
    ])
    expect(s.notes).toEqual([
      "Chaque bénévole inscrit reçoit ces emails sans action de votre part. Inscrit à plusieurs créneaux le même jour, il reçoit un seul email par rappel, qui liste tous ses créneaux de ce jour-là.",
    ])
    expect(s.links).toEqual([EVENT_LINK, SETTINGS_LINK])
  })

  it("all on for a draft: says they only go out once published", () => {
    const s = remindersSummary(facts({ published: false }))
    expect(s.state).toBe("on")
    expect(s.notes.at(-1)).toBe("Ils ne partent que tant que l'événement est publié.")
  })

  it("partly off at organization level: only what goes out is listed, and which ones are off", () => {
    const one = remindersSummary(facts({ organization: { j2: true, j1: false, dd: true } }))
    expect(one).toMatchObject({ state: "partly-off", ok: false, title: "Rappels automatiques en partie désactivés pour l'organisation" })
    expect(one.sent.map((x) => x.key)).toEqual(["j2", "dd"])
    expect(one.notes).toContain("Rappel J-1 est désactivé pour l'organisation.")
    expect(one.links).toEqual([EVENT_LINK, SETTINGS_LINK])

    const two = remindersSummary(facts({ organization: { j2: false, j1: true, dd: false } }))
    expect(two.sent.map((x) => x.label)).toEqual(["Rappel J-1"])
    expect(two.notes).toContain("Rappel J-2 et Rappel du jour sont désactivés pour l'organisation.")
  })

  it("all off at organization level: nothing goes out, the email settings first", () => {
    const s = remindersSummary(facts({ organization: { j2: false, j1: false, dd: false } }))
    expect(s).toMatchObject({ state: "org-off", ok: false, title: "Aucun rappel automatique : désactivés pour l'organisation", sent: [] })
    expect(s.notes[0]).toMatch(/^Les bénévoles ne reçoivent aucun rappel avant leurs créneaux\./)
    expect(s.links).toEqual([SETTINGS_LINK, EVENT_LINK])
  })

  it("off for this event: nothing goes out whatever the organization says, link to the event's checkbox", () => {
    const s = remindersSummary(facts({ eventEnabled: false }))
    expect(s).toMatchObject({ state: "event-off", ok: false, title: "Rappels automatiques coupés pour cet événement", sent: [] })
    expect(s.notes[0]).toMatch(/quels que soient les réglages de l'organisation/)
    expect(s.links).toEqual([EVENT_LINK])
  })

  it("no future shift: nothing left to send, no link", () => {
    const s = remindersSummary(facts({ upcomingShifts: false }))
    expect(s).toMatchObject({ state: "no-upcoming-shift", ok: false, title: "Aucun rappel automatique à venir", sent: [], links: [] })
    expect(s.notes).toEqual(["Aucun créneau de cet événement ne commence plus tard : plus aucun rappel automatique ne partira."])
  })

  it("never uses a middle dot or a dash as punctuation, and addresses the admin as « vous »", () => {
    const cases = [
      facts(), facts({ published: false }), facts({ organization: { j2: true, j1: false, dd: false } }),
      facts({ organization: { j2: false, j1: false, dd: false } }), facts({ eventEnabled: false }), facts({ upcomingShifts: false }),
    ]
    for (const c of cases) {
      const text = allText(remindersSummary(c))
      expect(text).not.toMatch(/[·—–]/)
      expect(text).not.toMatch(/\b(tu|ton|ta|tes)\b/)
    }
  })
})

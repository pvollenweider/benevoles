import { describe, it, expect } from "vitest"
import { acceptsRegistrations, closedMessage, formatMoment, isValidWindow, localWindowOrderInvalid, openUntilMessage, registrationState } from "../registration-window"

const TZ = "Europe/Zurich"
const published = { publicStatus: "published", registrationsOpen: true }

// Registration window independent from publication (#463).
describe("registrationState", () => {
  it("never opens a draft or an archived event, whatever the switch", () => {
    expect(registrationState({ ...published, publicStatus: "draft" })).toMatchObject({ open: false, reason: "not_published" })
    expect(registrationState({ ...published, publicStatus: "archived" })).toMatchObject({ open: false, reason: "not_published" })
  })

  it("follows the manual switch on a published event", () => {
    expect(acceptsRegistrations(published)).toBe(true)
    expect(registrationState({ ...published, registrationsOpen: false })).toMatchObject({ open: false, reason: "closed" })
  })

  it("opens and closes at the exact scheduled instants", () => {
    const opensAt = new Date("2026-06-01T16:00:00Z"), closesAt = new Date("2026-06-30T21:59:00Z")
    const e = { ...published, registrationOpensAt: opensAt, registrationClosesAt: closesAt }
    expect(registrationState(e, new Date("2026-06-01T15:59:59Z"))).toMatchObject({ open: false, reason: "not_yet" })
    expect(registrationState(e, opensAt)).toEqual({ open: true, closesAt })
    expect(registrationState(e, new Date("2026-06-30T21:58:59Z")).open).toBe(true)
    expect(registrationState(e, closesAt)).toMatchObject({ open: false, reason: "ended" })
    // The switch wins over the schedule.
    expect(registrationState({ ...e, registrationsOpen: false }, new Date("2026-06-10T00:00:00Z"))).toMatchObject({ reason: "closed" })
  })

  it("accepts ISO strings as sent to the public page", () => {
    expect(registrationState({ ...published, registrationOpensAt: "2030-01-01T00:00:00.000Z" }, new Date("2029-12-31T00:00:00Z")).open).toBe(false)
  })
})

describe("messages", () => {
  it("speaks in the organisation's time zone, across a DST change", () => {
    expect(formatMoment(new Date("2026-06-01T16:00:00Z"), TZ)).toBe("lundi 1 juin à 18h")
    expect(formatMoment(new Date("2026-12-01T17:00:00Z"), TZ)).toBe("mardi 1 décembre à 18h")
  })

  it("explains each closed state, and nothing when open", () => {
    const opensAt = new Date("2026-06-01T16:00:00Z")
    expect(closedMessage(registrationState({ ...published, registrationOpensAt: opensAt }, new Date("2026-05-01T00:00:00Z")), TZ))
      .toBe("Les inscriptions ouvrent le lundi 1 juin à 18h. Le planning est déjà consultable.")
    expect(closedMessage(registrationState({ ...published, registrationsOpen: false }), TZ)).toContain("fermées pour le moment")
    expect(closedMessage(registrationState({ ...published, registrationClosesAt: opensAt }, new Date("2026-07-01T00:00:00Z")), TZ)).toContain("terminées")
    expect(closedMessage(registrationState(published), TZ)).toBeNull()
  })

  it("says until when while open with a closing time", () => {
    const closesAt = new Date("2026-06-30T21:59:00Z")
    expect(openUntilMessage(registrationState({ ...published, registrationClosesAt: closesAt }, new Date("2026-06-10T00:00:00Z")), TZ))
      .toBe("Inscriptions ouvertes jusqu'au mardi 30 juin à 23h59.")
    expect(openUntilMessage(registrationState(published), TZ)).toBeNull()
  })
})

describe("isValidWindow", () => {
  it("wants the closing after the opening when both are set", () => {
    expect(isValidWindow(null, null)).toBe(true)
    expect(isValidWindow("2026-06-01T16:00:00Z", null)).toBe(true)
    expect(isValidWindow("2026-06-01T16:00:00Z", "2026-06-30T21:59:00Z")).toBe(true)
    expect(isValidWindow("2026-06-30T21:59:00Z", "2026-06-01T16:00:00Z")).toBe(false)
    expect(isValidWindow("2026-06-01T16:00:00Z", "2026-06-01T16:00:00Z")).toBe(false)
  })

  it("flags the form as soon as the closing is not after the opening", () => {
    expect(localWindowOrderInvalid("", "2026-06-01T18:00")).toBe(false)
    expect(localWindowOrderInvalid("2026-06-01T18:00", "")).toBe(false)
    expect(localWindowOrderInvalid("2026-06-01T18:00", "2026-06-30T23:59")).toBe(false)
    expect(localWindowOrderInvalid("2026-06-01T18:00", "2026-06-01T18:00")).toBe(true)
    expect(localWindowOrderInvalid("2026-06-30T23:59", "2026-06-01T18:00")).toBe(true)
  })
})

describe("local datetime inputs", () => {
  it("converts a local opening time to the instant and back, summer and winter", async () => {
    const { localDateTimeToUtc } = await import("../time-zone")
    const { localInputToUtc, utcToLocalInput } = await import("../registration-window")
    const summer = localInputToUtc("2026-06-01T18:00", TZ, localDateTimeToUtc)!
    expect(summer.toISOString()).toBe("2026-06-01T16:00:00.000Z")
    expect(utcToLocalInput(summer, TZ)).toBe("2026-06-01T18:00")
    const winter = localInputToUtc("2026-12-01T18:00", TZ, localDateTimeToUtc)!
    expect(winter.toISOString()).toBe("2026-12-01T17:00:00.000Z")
    expect(utcToLocalInput(winter, TZ)).toBe("2026-12-01T18:00")
    expect(localInputToUtc("", TZ, localDateTimeToUtc)).toBeNull()
    expect(localInputToUtc("demain", TZ, localDateTimeToUtc)).toBeNull()
    expect(utcToLocalInput(null, TZ)).toBe("")
  })
})

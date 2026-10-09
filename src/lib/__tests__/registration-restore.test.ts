import { describe, it, expect } from "vitest"
import { cancelledFrom, planRestore, recentCancellations, type RestoreInput } from "../registration-restore"

const base: RestoreInput = {
  status: "cancelled",
  previousStatus: "active",
  shiftStatus: "open",
  shiftStart: new Date("2026-07-04T08:00:00Z"),
  capacity: 2,
  occupied: 1,
  now: new Date("2026-07-01T10:00:00Z"),
}

describe("planRestore (#809)", () => {
  it("puts back a cancelled place, or a cancelled request as a request", () => {
    expect(planRestore(base)).toEqual({ ok: true, status: "active" })
    expect(planRestore({ ...base, previousStatus: "requested" })).toEqual({ ok: true, status: "requested" })
  })

  it("restores on a closed shift: closing stops sign-ups, not the organiser", () => {
    expect(planRestore({ ...base, shiftStatus: "closed" })).toMatchObject({ ok: true })
  })

  it.each(["waiting", "offered", null])("refuses what held no place to give back (%s)", (previousStatus) => {
    expect(planRestore({ ...base, previousStatus })).toMatchObject({ ok: false, reason: "not_restorable" })
  })

  it("refuses a registration that isn't cancelled", () => {
    expect(planRestore({ ...base, status: "active" })).toMatchObject({ ok: false, reason: "not_cancelled" })
  })

  it("refuses on a cancelled shift", () => {
    expect(planRestore({ ...base, shiftStatus: "cancelled" })).toMatchObject({ ok: false, reason: "shift_cancelled" })
  })

  it("refuses from the moment the shift starts", () => {
    expect(planRestore({ ...base, now: new Date("2026-07-04T07:59:59Z") })).toMatchObject({ ok: true })
    expect(planRestore({ ...base, now: new Date("2026-07-04T08:00:00Z") })).toMatchObject({ ok: false, reason: "started" })
  })

  it("never overbooks: refused once the spot was taken", () => {
    expect(planRestore({ ...base, occupied: 2 })).toMatchObject({ ok: false, reason: "full", message: "Ce créneau est complet : la place a été reprise." })
  })
})

describe("cancelledFrom", () => {
  it("reads the status before the cancellation", () => {
    expect(cancelledFrom({ status: { from: "requested", to: "cancelled" } })).toBe("requested")
  })
  it.each([null, undefined, {}, { status: {} }, { status: { from: 3 } }])("is null without one (%j)", (changes) => {
    expect(cancelledFrom(changes)).toBeNull()
  })
})

describe("recentCancellations (#809)", () => {
  const now = new Date("2026-07-01T10:00:00Z")
  const row = (over: Partial<import("../registration-restore").CancelledRegistration> = {}) => ({
    id: "r1",
    volunteerName: "Chloé Roy",
    hasEmail: true,
    shift: "Bar, samedi 4 juillet, de 10h à 12h",
    shiftStatus: "open",
    shiftStart: new Date("2026-07-04T08:00:00Z"),
    capacity: 2,
    occupied: 1,
    liveAgainOnShift: false,
    cancellation: { actorType: "volunteer", at: new Date("2026-06-30T12:05:00Z"), changes: { status: { from: "active", to: "cancelled" } } },
    ...over,
  })

  it("offers « Rétablir » with who cancelled and when, in the organisation's time zone", () => {
    expect(recentCancellations([row()], now, "Europe/Zurich")).toEqual([{
      id: "r1", volunteerName: "Chloé Roy", hasEmail: true, shift: "Bar, samedi 4 juillet, de 10h à 12h",
      previousStatus: "active", cancelled: "Annulée par la personne le 30 juin à 14:05", blocked: null,
    }])
    expect(recentCancellations([row({ cancellation: { actorType: "admin", at: new Date("2026-06-30T12:05:00Z"), changes: { status: { from: "requested" } } } })], now, "UTC")[0])
      .toMatchObject({ previousStatus: "requested", cancelled: "Annulée par l'organisation le 30 juin à 12:05" })
  })

  it("keeps a full shift or a person signed up again, with the reason instead of the button", () => {
    expect(recentCancellations([row({ occupied: 2 })], now, "UTC")[0].blocked).toBe("Complet : la place a été reprise.")
    expect(recentCancellations([row({ liveAgainOnShift: true })], now, "UTC")[0].blocked).toBe("Cette personne a une autre inscription en cours sur ce créneau.")
  })

  it("leaves out what could never be restored", () => {
    const never = [
      row({ id: "wait", cancellation: { actorType: "volunteer", at: now, changes: { status: { from: "waiting" } } } }),
      row({ id: "nolog", cancellation: null }),
      row({ id: "started", shiftStart: new Date("2026-07-01T09:00:00Z") }),
      row({ id: "gone", shiftStatus: "cancelled" }),
    ]
    expect(recentCancellations(never, now, "UTC")).toEqual([])
  })

  it("lists the latest cancellation first", () => {
    const rows = [
      row({ id: "old", cancellation: { actorType: "admin", at: new Date("2026-06-01T10:00:00Z"), changes: { status: { from: "active" } } } }),
      row({ id: "new", cancellation: { actorType: "admin", at: new Date("2026-06-30T10:00:00Z"), changes: { status: { from: "active" } } } }),
    ]
    expect(recentCancellations(rows, now, "UTC").map((r) => r.id)).toEqual(["new", "old"])
  })
})

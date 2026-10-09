import { describe, it, expect } from "vitest"
import { cancelledFrom, planRestore, type RestoreInput } from "../registration-restore"

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

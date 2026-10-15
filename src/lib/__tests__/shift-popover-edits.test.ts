import { describe, expect, it } from "vitest"
import { closingPatch, linkPlan, type PopoverShift } from "../shift-popover-edits"

const shift: PopoverShift = { roleName: "Bar", label: "Bar", capacity: 3, registrationCount: 2, minVolunteers: null }
// The popover shows an empty label when it is the role name.
const untouched = { label: "", capacity: 3, minimum: "" }

describe("closingPatch", () => {
  it("saves the label (empty is the role name) and the places", () => {
    expect(closingPatch(shift, untouched)).toEqual({ patch: { label: "Bar", capacity: 3 }, pairProblem: null })
    expect(closingPatch(shift, { ...untouched, label: "  Bar soir ", capacity: 5 }).patch).toEqual({ label: "Bar soir", capacity: 5 })
  })

  it("keeps the places under the confirmed people out of the patch", () => {
    expect(closingPatch(shift, { ...untouched, capacity: 1 }).patch).toEqual({ label: "Bar" })
    expect(closingPatch({ ...shift, registrationCount: 0 }, { ...untouched, capacity: 0 }).patch).toEqual({ label: "Bar" })
  })

  it("sends the minimum only when it changed, and drops places and minimum when they do not fit", () => {
    expect(closingPatch(shift, { ...untouched, minimum: "2" }).patch).toEqual({ label: "Bar", capacity: 3, minVolunteers: 2 })
    expect(closingPatch({ ...shift, minVolunteers: 2 }, { ...untouched, minimum: "" }).patch).toEqual({ label: "Bar", capacity: 3, minVolunteers: null })
    const bad = closingPatch(shift, { ...untouched, capacity: 4, minimum: "6" })
    expect(bad.patch).toEqual({ label: "Bar" })
    expect(bad.pairProblem).toMatch(/dépasse les places/)
  })
})

// #991: « Voir les inscriptions » used to leave without saving what closing saves.
describe("linkPlan", () => {
  it("follows the link at once when nothing was changed", () => {
    expect(linkPlan(shift, untouched)).toEqual({ kind: "follow" })
    expect(linkPlan(shift, { ...untouched, label: "  " })).toEqual({ kind: "follow" })
    expect(linkPlan({ ...shift, label: "Bar soir" }, { ...untouched, label: "Bar soir" })).toEqual({ kind: "follow" })
    expect(linkPlan({ ...shift, minVolunteers: 2 }, { ...untouched, minimum: " 2 " })).toEqual({ kind: "follow" })
  })

  it("saves a changed capacity first, with the same patch as closing", () => {
    const typed = { ...untouched, capacity: 6 }
    expect(linkPlan(shift, typed)).toEqual({ kind: "save", patch: closingPatch(shift, typed).patch })
    expect(linkPlan(shift, typed)).toEqual({ kind: "save", patch: { label: "Bar", capacity: 6 } })
  })

  it("saves a changed label or minimum first", () => {
    expect(linkPlan(shift, { ...untouched, label: "Bar soir" })).toEqual({ kind: "save", patch: { label: "Bar soir", capacity: 3 } })
    expect(linkPlan(shift, { ...untouched, minimum: "2" })).toEqual({ kind: "save", patch: { label: "Bar", capacity: 3, minVolunteers: 2 } })
    // A custom label cleared back to the role name is a change too.
    expect(linkPlan({ ...shift, label: "Bar soir" }, untouched)).toEqual({ kind: "save", patch: { label: "Bar", capacity: 3 } })
  })

  it("stays on the field when a changed value cannot be saved", () => {
    expect(linkPlan(shift, { ...untouched, capacity: 1 })).toEqual({ kind: "fix", field: "capacity" })
    expect(linkPlan(shift, { ...untouched, label: "Bar soir", capacity: 1 })).toEqual({ kind: "fix", field: "capacity" })
    expect(linkPlan(shift, { ...untouched, minimum: "5" })).toEqual({ kind: "fix", field: "minimum" })
    expect(linkPlan(shift, { ...untouched, minimum: "0" })).toEqual({ kind: "fix", field: "minimum" })
    expect(linkPlan({ ...shift, minVolunteers: 3 }, { ...untouched, capacity: 2, minimum: "3" })).toEqual({ kind: "fix", field: "minimum" })
  })

  it("does not block a label change on a shift already over its places", () => {
    const overBooked = { ...shift, capacity: 1, registrationCount: 2 }
    expect(linkPlan(overBooked, { label: "Bar soir", capacity: 1, minimum: "" })).toEqual({ kind: "save", patch: { label: "Bar soir" } })
  })
})

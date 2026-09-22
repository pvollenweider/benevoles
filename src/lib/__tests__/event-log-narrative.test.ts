import { describe, it, expect } from "vitest"
import { describeChanges, describeEntry, narrateChain } from "../event-log-narrative"
import type { EventLogEntry } from "../event-log-read"

function entry(overrides: Partial<EventLogEntry>): EventLogEntry {
  return {
    id: "log-1",
    eventId: "evt-1",
    actorType: "admin",
    actorId: "admin-1",
    actorLabel: "Alice",
    action: "shift.created",
    entityType: "Shift",
    entityId: "shift-1",
    changes: null,
    causedByLogId: null,
    createdAt: new Date("2026-09-12T10:00:00.000Z"),
    ...overrides,
  }
}

describe("describeChanges", () => {
  it("renders each changed field with its French label", () => {
    const lines = describeChanges({ capacity: { from: 3, to: 4 }, status: { from: "open", to: "full" } })
    expect(lines).toEqual(["capacité : 3 → 4", "statut : open → full"])
  })

  it("returns an empty list when there is nothing to show", () => {
    expect(describeChanges(null)).toEqual([])
  })

  it("falls back to the raw field name for an unknown field", () => {
    expect(describeChanges({ mysteryField: { from: 1, to: 2 } })).toEqual(["mysteryField : 1 → 2"])
  })
})

describe("describeEntry", () => {
  it("describes a volunteer self-service registration", () => {
    expect(describeEntry(entry({ action: "registration.created", actorType: "volunteer", actorLabel: "Alain Dupont" }))).toBe(
      "Alain Dupont s'est inscrit·e",
    )
  })

  it("describes a system-triggered waitlist offer without a human actor", () => {
    expect(describeEntry(entry({ action: "registration.waitlist_offered", actorType: "system", actorLabel: "Système" }))).toBe(
      "Une place s'est libérée et a été proposée",
    )
  })

  it("falls back to the raw action name when there is no template", () => {
    expect(describeEntry(entry({ action: "unknown.action", actorLabel: "Alice" }))).toBe("Alice : unknown.action")
  })

  it("names which shift a registration is for, when a label is available", () => {
    const e = entry({
      action: "registration.created",
      actorType: "volunteer",
      actorLabel: "Eloïse Marilou Vollenweider",
      changes: { shiftId: { from: null, to: "shift-bar" } },
    })
    const shiftLabels = { "shift-bar": { compact: "Bar · 25/06 18:15–19:00", prose: "Bar du 25/06, 18:15–19:00" } }
    expect(describeEntry(e, shiftLabels)).toBe(
      "Eloïse Marilou Vollenweider s'est inscrit·e pour le créneau Bar du 25/06, 18:15–19:00",
    )
  })

  it("says nothing about the shift when no label map is given, instead of showing a raw id", () => {
    const e = entry({
      action: "registration.created",
      actorLabel: "Alain",
      changes: { shiftId: { from: null, to: "shift-bar" } },
    })
    expect(describeEntry(e)).toBe("Alain s'est inscrit·e")
  })

  it("does not append a shift phrase to actions that aren't about a specific shift", () => {
    const e = entry({
      action: "shift.updated",
      actorLabel: "Alice",
      changes: { shiftId: { from: null, to: "shift-bar" } }, // wouldn't realistically happen, but guards the allowlist
    })
    const shiftLabels = { "shift-bar": { compact: "Bar · 25/06 18:15–19:00", prose: "Bar du 25/06, 18:15–19:00" } }
    expect(describeEntry(e, shiftLabels)).toBe("Alice a modifié ce créneau")
  })
})

describe("narrateChain", () => {
  it("returns an empty string for an empty chain", () => {
    expect(narrateChain([])).toBe("")
  })

  it("connects a cancellation to the waitlist offer and confirmation it caused", () => {
    const cancel = entry({
      id: "log-1",
      action: "registration.cancelled",
      actorType: "volunteer",
      actorLabel: "Alain Dupont",
      createdAt: new Date("2026-09-13T09:00:00.000Z"),
    })
    const offer = entry({
      id: "log-2",
      action: "registration.waitlist_offered",
      actorType: "system",
      actorLabel: "Système",
      causedByLogId: "log-1",
      createdAt: new Date("2026-09-13T09:00:01.000Z"),
    })
    const confirm = entry({
      id: "log-3",
      action: "registration.waitlist_confirmed",
      actorType: "volunteer",
      actorLabel: "Chloé Martin",
      causedByLogId: "log-2",
      createdAt: new Date("2026-09-13T09:15:00.000Z"),
    })

    const text = narrateChain([cancel, offer, confirm])

    expect(text).toContain("Alain Dupont s'est désinscrit")
    expect(text).toContain("libéré une place, proposée")
    expect(text).toContain("Chloé Martin")
    expect(text).toMatch(/confirm/i)
  })

  it("does not glue two entries with a causal connector when there is no causedByLogId between them", () => {
    const a = entry({ id: "log-1", action: "registration.created", actorLabel: "Alain", createdAt: new Date("2026-09-12T10:00:00.000Z") })
    const b = entry({ id: "log-2", action: "registration.cancelled", actorLabel: "Alain", causedByLogId: null, createdAt: new Date("2026-09-13T10:00:00.000Z") })
    const text = narrateChain([a, b])
    expect(text).not.toMatch(/ce qui a/)
  })

  it("includes the shift a registration is for, when narrating a chain", () => {
    const created = entry({
      id: "log-1",
      action: "registration.created",
      actorType: "volunteer",
      actorLabel: "Eloïse Marilou Vollenweider",
      changes: { shiftId: { from: null, to: "shift-bar" } },
      createdAt: new Date("2026-09-22T15:07:00.000Z"),
    })
    const shiftLabels = { "shift-bar": { compact: "Bar · 25/06 18:15–19:00", prose: "Bar du 25/06, 18:15–19:00" } }
    const text = narrateChain([created], shiftLabels)
    expect(text).toContain("pour le créneau Bar du 25/06, 18:15–19:00")
  })

  it("prefixes a new day with its date instead of repeating it inline", () => {
    const a = entry({ id: "log-1", action: "registration.created", actorLabel: "Alain", createdAt: new Date("2026-09-12T10:00:00.000Z") })
    const b = entry({ id: "log-2", action: "registration.cancelled", actorLabel: "Alain", createdAt: new Date("2026-09-13T11:30:00.000Z") })
    const text = narrateChain([a, b])
    expect(text).toMatch(/Le 12 septembre/)
    expect(text).toMatch(/Le 13 septembre/)
  })
})

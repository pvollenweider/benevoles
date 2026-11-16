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
  it("names a milestone's owner by its account's current name, or says the account is gone (#985)", () => {
    const labels = { "adm-2": { compact: "Samira Diallo", prose: "Samira Diallo" } }
    expect(describeChanges({ ownerId: { from: null, to: "adm-2" } }, labels, "EventMilestone")).toEqual(["qui s'en occupe : — → Samira Diallo"])
    expect(describeChanges({ ownerId: { from: "adm-old", to: null } }, labels, "EventMilestone")).toEqual(["qui s'en occupe : compte supprimé → —"])
  })

  it("renders each changed field with its French label", () => {
    const lines = describeChanges({ capacity: { from: 3, to: 4 }, status: { from: "open", to: "full" } }, undefined, "Shift")
    expect(lines).toEqual(["places : 3 → 4", "statut : ouvert → complet"])
  })

  it("reads a check-in and its undo in French, never the stored field name or « set »", () => {
    expect(describeChanges({ checkedInAt: { from: null, to: "2026-07-04T09:00:00.000Z" } }, undefined, "Registration")).toEqual(["présence : — → 4 juillet"])
    expect(describeChanges({ checkedInAt: { from: "set", to: null } }, undefined, "Registration")).toEqual(["présence : enregistrée → —"])
  })

  it("shows a registration status change in French, not the stored values (#929)", () => {
    expect(describeChanges({ status: { from: "waiting", to: "offered" } }, undefined, "Registration")).toEqual([
      "statut : liste d'attente → place proposée",
    ])
  })

  it("agrees « annulé(e) » with the entity whose status changed (#929)", () => {
    expect(describeChanges({ status: { from: "active", to: "cancelled" } }, undefined, "Registration")).toEqual(["statut : confirmée → annulée"])
    expect(describeChanges({ status: { from: "full", to: "cancelled" } }, undefined, "Shift")).toEqual(["statut : complet → annulé"])
  })

  it("labels the source, the publication status and booleans (#929)", () => {
    expect(describeChanges({
      source: { from: null, to: "admin_manual" },
      publicStatus: { from: "published", to: "draft" },
      waitlistEnabled: { from: false, to: true },
    }, undefined, "Event")).toEqual([
      "origine : — → manuel",
      "statut de publication : publié → brouillon",
      "liste d'attente : non → oui",
    ])
  })

  it("keeps an unknown value as stored (#929)", () => {
    expect(describeChanges({ status: { from: "mystery", to: "open" } }, undefined, "Shift")).toEqual(["statut : mystery → ouvert"])
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
      "Alain Dupont a enregistré une inscription",
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

  it("describes a member declining an invitation (#558)", () => {
    expect(describeEntry(entry({ action: "memberinvite.declined", entityType: "MemberInvite", actorType: "volunteer", actorLabel: "Alain Dupont" }))).toBe(
      "Alain Dupont a indiqué ne pas être disponible pour cet événement",
    )
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
      "Eloïse Marilou Vollenweider a enregistré une inscription pour le créneau Bar du 25/06, 18:15–19:00",
    )
  })

  it("says nothing about the shift when no label map is given, instead of showing a raw id", () => {
    const e = entry({
      action: "registration.created",
      actorLabel: "Alain",
      changes: { shiftId: { from: null, to: "shift-bar" } },
    })
    expect(describeEntry(e)).toBe("Alain a enregistré une inscription")
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

    expect(text).toContain("Alain Dupont a annulé une inscription")
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

describe("narrateChain time zone (#344)", () => {
  it("writes days and times in the organization's zone", () => {
    const chain = [entry({ createdAt: new Date("2026-09-12T22:30:00.000Z") })]
    expect(narrateChain(chain, undefined, "Europe/Zurich")).toMatch(/^Le 13 septembre à 00:30 : /)
    expect(narrateChain(chain, undefined, "America/New_York")).toMatch(/^Le 12 septembre à 18:30 : /)
  })
})

describe("an availability acknowledgement in the journal (#1146, lot B)", () => {
  const evidence = { v: 1, via: "accept", requestId: "req-1", revision: 2, shiftStart: "2030-07-11T12:00:00.000Z", shiftEnd: "2030-07-11T18:00:00.000Z", timeZone: "Europe/Zurich", state: "partial", totalMinutes: 360, coveredMinutes: 270, outsideMinutes: 90, unknownMinutes: 0 }
  const ack = entry({ action: "registration.availability_acknowledged", entityType: "Registration", changes: { shiftId: { from: "shift-1", to: "shift-1" }, availabilityAck: { from: null, to: evidence } } })
  const labels = { "shift-1": { compact: "Bar · 11/07 14:00–20:00", spoken: "Bar, le 11 juillet de 14:00 à 20:00" } } as never

  it("says who confirmed it, on which shift, and the minutes, never the ranges", () => {
    expect(describeEntry(ack, labels)).toMatch(/^Alice a confirmé l'affectation malgré les disponibilités indiquées/)
    expect(describeChanges(ack.changes, labels, "Registration")).toEqual(["hors des disponibilités indiquées : — → pas disponible 1 h 30 sur 6 h (acceptation d'une demande)"])
  })

  it("still reads an entry of another version", () => {
    expect(describeChanges({ availabilityAck: { from: null, to: { v: 9 } } }, undefined, "Registration")).toEqual(["hors des disponibilités indiquées : — → confirmé"])
  })
})

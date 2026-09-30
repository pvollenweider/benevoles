import { describe, it, expect } from "vitest"
import { activityCsv, csvCell, csvDocument, eventArchive, exportFileName, membersCsv, RETENTION, stripSecrets } from "../data-export"

// Data export and portability (#384).
describe("csv", () => {
  it("quotes only what needs it and writes an Excel-friendly document", () => {
    expect(csvCell("plain")).toBe("plain")
    expect(csvCell('a;b "c"')).toBe('"a;b ""c"""')
    expect(csvCell(null)).toBe("")
    const doc = csvDocument(["A", "B"], [["x", 1], ["y;z", null]])
    expect(doc.startsWith("﻿A;B\r\n")).toBe(true)
    expect(doc).toContain('"y;z";')
    expect(doc.endsWith("\r\n")).toBe(true)
  })

  it("members: one row per member with tags, availability, notes and counts", () => {
    const csv = membersCsv([{
      firstName: "Zoé", lastName: "Roy", email: "z@x.ch", phone: null, tags: ["bar", "cuisine"], active: false, notes: "aime le matin",
      birthDate: new Date("2000-05-06T00:00:00Z"), availabilityPeriods: ["matin"], availabilityNote: null, createdAt: new Date("2026-07-04T08:00:00Z"), registrationCount: 3,
    }], "Europe/Zurich")
    const line = csv.split("\r\n")[1]
    expect(line).toBe("Zoé;Roy;z@x.ch;;bar, cuisine;non;2000-05-06;matin;;aime le matin;3;04/07/2026 10:00")
  })

  it("activity: changes serialized as JSON", () => {
    const csv = activityCsv([{ createdAt: new Date("2026-07-04T08:00:00Z"), actorType: "admin", actorLabel: "Léa", action: "member.updated", entityType: "Member", entityId: "m1", changes: { tags: { from: [], to: ["bar"] } } }], "Europe/Zurich")
    expect(csv.split("\r\n")[1]).toBe('04/07/2026 10:00;Léa;admin;member.updated;Member;m1;"{""tags"":{""from"":[],""to"":[""bar""]}}"')
  })
})

describe("event archive", () => {
  it("bundles everything and strips every token or hash, however deep", () => {
    const archive = eventArchive({
      organization: { name: "Org", slug: "org" },
      event: { id: "e1", title: "Fête", slug: "fete" },
      shifts: [{ id: "s1", roleName: "Bar" }],
      registrations: [{ id: "r1", editTokenHash: "h", editTokenEnc: "enc", editTokenLegacy: null, volunteer: { firstName: "A", lastName: "B", email: null, phone: null } }],
      pages: [], sectorLeaders: [{ roleName: "Bar", name: "Léa", email: "l@x.ch", createdAt: new Date() }], milestones: [],
      logs: [{ id: "l1", action: "shift.created", changes: { token: "nope", label: { from: null, to: "Bar" } } }],
      exportedAt: new Date("2026-07-04T08:00:00Z"),
    })
    const text = JSON.stringify(archive)
    expect(text).not.toMatch(/editToken|"token"|tokenHash|"enc"/)
    expect(archive.counts).toEqual({ shifts: 1, registrations: 1, pages: 0, sectorLeaders: 1, milestones: 0, log: 1 })
    expect(archive.format).toBe("benevol-event-archive")
    expect(stripSecrets({ a: { tokenHash: "x", keep: 1 } })).toEqual({ a: { keep: 1 } })
  })

  it("names files safely and states the retention", () => {
    expect(exportFileName("Fête d'été 2026 !", new Date("2026-07-04T10:00:00Z"), "json")).toBe("fete-d-ete-2026-2026-07-04.json")
    expect(exportFileName("", new Date("2026-07-04T10:00:00Z"), "csv")).toBe("export-2026-07-04.csv")
    expect(RETENTION.length).toBeGreaterThanOrEqual(4)
    expect(RETENTION.some((r) => r.howLong.includes("30 jours après sa désactivation"))).toBe(true)
  })
})

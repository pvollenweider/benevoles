import { describe, it, expect } from "vitest"
import { activityCsv, csvCell, csvDocument, eventArchive, exportFileName, memberHoursCsv, membersCsv, stripSecrets } from "../data-export"

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
    expect(line).toBe("Zoé;Roy;z@x.ch;;bar, cuisine;non;2000-05-06;matin;;aime le matin;3;04/07/2026 10:00;;")
  })

  // #569: proof of acceptance of the volunteer charter is the member's own data too.
  it("members: last charter acceptance date, empty when every registration was added manually", () => {
    const withAcceptance = membersCsv([{
      firstName: "Zoé", lastName: "Roy", email: "z@x.ch", phone: null, tags: [], active: true, notes: null,
      birthDate: null, availabilityPeriods: [], availabilityNote: null, createdAt: new Date("2026-07-04T08:00:00Z"), registrationCount: 1,
      charterAcceptedAt: new Date("2026-07-04T08:00:00Z"),
    }], "Europe/Zurich")
    expect(withAcceptance.split("\r\n")[1]).toContain("04/07/2026 10:00")

    const withoutAcceptance = membersCsv([{
      firstName: "Zoé", lastName: "Roy", email: "z@x.ch", phone: null, tags: [], active: true, notes: null,
      birthDate: null, availabilityPeriods: [], availabilityNote: null, createdAt: new Date("2026-07-04T08:00:00Z"), registrationCount: 1,
      charterAcceptedAt: null,
    }], "Europe/Zurich")
    expect(withoutAcceptance.split("\r\n")[1].endsWith(";")).toBe(true)
  })

  // #598: a member's own delivery outcomes are their own data, included in the export used to
  // answer an access request — in French words, never the raw SMTP reply or the address.
  it("members: delivery outcomes are listed in French words, without any raw SMTP detail", () => {
    const csv = membersCsv([{
      firstName: "Zoé", lastName: "Roy", email: "z@x.ch", phone: null, tags: [], active: true, notes: null,
      birthDate: null, availabilityPeriods: [], availabilityNote: null, createdAt: new Date("2026-07-04T08:00:00Z"), registrationCount: 0,
      deliveryOutcomes: [{ date: new Date("2026-07-05T08:00:00Z"), kind: "Confirmation d'inscription", outcome: "refus définitif", reason: "boîte aux lettres introuvable" }],
    }], "Europe/Zurich")
    const line = csv.split("\r\n")[1]
    expect(line).toContain("05/07/2026 10:00 Confirmation d'inscription : refus définitif (boîte aux lettres introuvable)")
  })

  it("hours by volunteer: one row per member, a total line, and neutralised formula-like names (#557, #567)", () => {
    const csv = memberHoursCsv([
      { firstName: "Zoé", lastName: "Roy", eventsCount: 2, shiftsCount: 3, plannedHours: 4.5, attestedHours: 2 },
      { firstName: "=cmd", lastName: "Dupont", eventsCount: 1, shiftsCount: 1, plannedHours: 0, attestedHours: 2 },
    ])
    const lines = csv.split("\r\n")
    expect(lines[0]).toBe("﻿Prénom;Nom;Événements;Créneaux;Heures prévues;Heures attestées")
    expect(lines[1]).toBe("Zoé;Roy;2;3;4.5;2")
    expect(lines[2]).toBe("'=cmd;Dupont;1;1;0;2")
    expect(lines[3]).toBe("Total;;;4;4.5;4")
  })

  it("hours by volunteer with an hourly rate (#867): estimated amounts from the minutes, rate and currency on every line", () => {
    const rate = { cents: 2550, currency: "CHF" as const, setAt: null }
    const csv = memberHoursCsv([
      // 2 h 50 planned, 1 h 20 attested: amounts from the minutes (72.25 and 34.00), not from the rounded hours.
      { firstName: "Zoé", lastName: "Roy", eventsCount: 2, shiftsCount: 3, plannedHours: 2.83, attestedHours: 1.33, plannedMinutes: 170, attestedMinutes: 80 },
      { firstName: "Léo", lastName: "Dupont", eventsCount: 1, shiftsCount: 1, plannedHours: 1, attestedHours: 0, plannedMinutes: 60, attestedMinutes: 0 },
    ], rate)
    const lines = csv.split("\r\n")
    expect(lines[0]).toBe("\uFEFFPrénom;Nom;Événements;Créneaux;Heures prévues;Heures attestées;Valorisation estimée des heures prévues;Valorisation estimée des heures attestées;Taux horaire;Devise")
    expect(lines[1]).toBe("Zoé;Roy;2;3;2.83;1.33;72.25;34;25.5;CHF")
    expect(lines[2]).toBe("Léo;Dupont;1;1;1;0;25.5;0;25.5;CHF")
    // The total adds up the members' amounts; the rate is repeated, never summed.
    expect(lines[3]).toBe("Total;;;4;3.83;1.33;97.75;34;25.5;CHF")
  })

  it("hours by volunteer without a rate: the same file as before (#867)", () => {
    const rows = [{ firstName: "Zoé", lastName: "Roy", eventsCount: 1, shiftsCount: 1, plannedHours: 1, attestedHours: 1, plannedMinutes: 60, attestedMinutes: 60 }]
    expect(memberHoursCsv(rows, null)).toBe(memberHoursCsv(rows))
    expect(memberHoursCsv(rows).split("\r\n")[0]).toBe("\uFEFFPrénom;Nom;Événements;Créneaux;Heures prévues;Heures attestées")
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

  it("names files safely", () => {
    expect(exportFileName("Fête d'été 2026 !", new Date("2026-07-04T10:00:00Z"), "json")).toBe("fete-d-ete-2026-2026-07-04.json")
    expect(exportFileName("", new Date("2026-07-04T10:00:00Z"), "csv")).toBe("export-2026-07-04.csv")
  })
})

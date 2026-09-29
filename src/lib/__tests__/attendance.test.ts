import { describe, it, expect } from "vitest"
import { attendanceCsv, attendanceSummary, attendanceTotals, formatCheckIn, type AttendanceRow } from "../attendance"

const row = (over: Partial<AttendanceRow> = {}): AttendanceRow => ({
  firstName: "Alice", lastName: "Martin", email: "alice@x.ch", phone: "079 000 00 00", roleName: "Bar", label: "Bar",
  date: "2026-07-04", startTime: "10:00", endTime: "12:00", checkedInAt: null, ...over,
})

describe("attendance totals and wording", () => {
  it("counts present people among the registered", () => {
    const t = attendanceTotals([row(), row({ checkedInAt: new Date() }), row({ checkedInAt: new Date() })])
    expect(t).toEqual({ registered: 3, present: 2 })
    expect(attendanceSummary(t)).toBe("2 présents sur 3")
    expect(attendanceSummary({ registered: 1, present: 1 })).toBe("1 présent sur 1")
    expect(attendanceSummary({ registered: 0, present: 0 })).toBe("Aucun inscrit.")
  })
})

describe("attendanceCsv", () => {
  it("writes a BOM, a French header, semicolons, quoted cells and the check-in time in the org zone", () => {
    const csv = attendanceCsv([
      row({ checkedInAt: new Date("2026-07-04T08:05:00Z") }),
      row({ firstName: "Bob; \"B\"", lastName: "Durand", email: null, phone: null, label: "Bar soir", startTime: "18:00", endTime: "20:00" }),
    ], "Europe/Zurich")
    const lines = csv.split("\r\n")
    expect(lines[0]).toBe("﻿Prénom;Nom;Email;Téléphone;Poste;Créneau;Date;Début;Fin;Présent;Pointé le")
    expect(lines[1]).toBe("Alice;Martin;alice@x.ch;079 000 00 00;Bar;;2026-07-04;10:00;12:00;oui;04.07.2026 10:05")
    expect(lines[2]).toBe('"Bob; ""B""";Durand;;;Bar;Bar soir;2026-07-04;18:00;20:00;non;')
    expect(lines[3]).toBe("")
  })

  it("formats a missing check-in as empty", () => {
    expect(formatCheckIn(null, "Europe/Zurich")).toBe("")
  })
})

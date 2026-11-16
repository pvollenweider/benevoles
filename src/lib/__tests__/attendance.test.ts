import { describe, it, expect } from "vitest"
import { attendanceCsv, attendanceSummary, attendanceTotals, formatCheckIn, type AttendanceRow } from "../attendance"

const row = (over: Partial<AttendanceRow> = {}): AttendanceRow => ({
  firstName: "Alice", lastName: "Martin", email: "alice@x.ch", phone: "079 000 00 00", roleName: "Bar", label: "Bar",
  date: "2026-07-04", startTime: "10:00", endTime: "12:00", checkedInAt: null, ...over,
})

describe("attendance totals and wording", () => {
  it("counts present people among the registered", () => {
    const t = attendanceTotals([row(), row({ checkedInAt: new Date() }), row({ checkedInAt: new Date() })])
    expect(t).toEqual({ registered: 3, present: 2, absent: 0 })
    expect(attendanceSummary(t)).toBe("2 présents sur 3")
    expect(attendanceSummary({ registered: 1, present: 1, absent: 0 })).toBe("1 présent sur 1")
    expect(attendanceSummary({ registered: 0, present: 0, absent: 0 })).toBe("Aucun inscrit.")
  })

  it("counts recorded absences apart, and names them only when there are any (#1141)", () => {
    const t = attendanceTotals([row({ checkedInAt: new Date() }), row({ attendanceStatus: "absent" }), row({ attendanceStatus: "absent" }), row()])
    expect(t).toEqual({ registered: 4, present: 1, absent: 2 })
    expect(attendanceSummary(t)).toBe("1 présent sur 4, 2 absents")
    expect(attendanceSummary({ registered: 20, present: 12, absent: 2 })).toBe("12 présents sur 20, 2 absents")
    expect(attendanceSummary({ registered: 20, present: 12, absent: 1 })).toBe("12 présents sur 20, 1 absent")
    // A row without the column (read before #1141) is expected or present, never absent.
    expect(attendanceTotals([{ checkedInAt: null }, { checkedInAt: "2026-07-04T08:05:00Z" }])).toEqual({ registered: 2, present: 1, absent: 0 })
  })
})

describe("attendanceCsv", () => {
  it("writes a BOM, a French header, semicolons, quoted cells and the check-in time in the org zone", () => {
    const csv = attendanceCsv([
      row({ checkedInAt: new Date("2026-07-04T08:05:00Z") }),
      row({ firstName: "Bob; \"B\"", lastName: "Durand", email: null, phone: null, label: "Bar soir", startTime: "18:00", endTime: "20:00" }),
    ], "Europe/Zurich")
    const lines = csv.split("\r\n")
    expect(lines[0]).toBe("﻿Prénom;Nom;Email;Téléphone;Poste;Créneau;Date;Début;Fin;Présent;Pointé le;Absence notée")
    expect(lines[1]).toBe("Alice;Martin;alice@x.ch;079 000 00 00;Bar;;2026-07-04;10:00;12:00;oui;04.07.2026 10:05;")
    expect(lines[2]).toBe('"Bob; ""B""";Durand;;;Bar;Bar soir;2026-07-04;18:00;20:00;non;;')
    expect(lines[3]).toBe("")
  })

  it("keeps « Présent » (oui / non) and « Pointé le » where they were, and adds « Absence notée » after them (#1141)", () => {
    const csv = attendanceCsv([
      row({ checkedInAt: new Date("2026-07-04T08:05:00Z"), answers: ["M"] } as Partial<AttendanceRow>),
      row({ firstName: "Lucas", lastName: "Favre", attendanceStatus: "absent", answers: ["L"] } as Partial<AttendanceRow>),
      row({ firstName: "Chloé", lastName: "Dubois", answers: [""] } as Partial<AttendanceRow>),
    ], "Europe/Zurich", ["Taille"])
    const [header, present, absent, expected] = csv.replace("\ufeff", "").split("\r\n").map((l) => l.split(";"))
    // The eleven columns existing spreadsheets read, at the same positions.
    expect(header.slice(0, 11)).toEqual(["Prénom", "Nom", "Email", "Téléphone", "Poste", "Créneau", "Date", "Début", "Fin", "Présent", "Pointé le"])
    expect(header.slice(11)).toEqual(["Absence notée", "Taille"])
    expect(present.slice(9)).toEqual(["oui", "04.07.2026 10:05", "", "M"])
    // An absent person is « non » in « Présent », as before, and « oui » in the new column.
    expect(absent.slice(9)).toEqual(["non", "", "oui", "L"])
    expect(expected.slice(9)).toEqual(["non", "", "", ""])
  })

  it("a row with both a check-in and « absent » (rolling deployment) is present: counted as such, « oui » in « Présent », nothing in « Absence notée »", () => {
    const mixed = row({ firstName: "Mathieu", lastName: "Bonvin", checkedInAt: new Date("2026-07-04T08:05:00Z"), attendanceStatus: "absent" })
    expect(attendanceTotals([mixed, row({ attendanceStatus: "absent" })])).toEqual({ registered: 2, present: 1, absent: 1 })
    const line = attendanceCsv([mixed], "Europe/Zurich").split("\r\n")[1].split(";")
    expect(line.slice(9)).toEqual(["oui", "04.07.2026 10:05", ""])
  })

  it("formats a missing check-in as empty", () => {
    expect(formatCheckIn(null, "Europe/Zurich")).toBe("")
  })
})

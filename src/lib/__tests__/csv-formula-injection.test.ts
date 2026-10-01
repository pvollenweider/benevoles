import { describe, it, expect } from "vitest"
import { activityCsv, csvCell, csvDocument, membersCsv } from "../data-export"
import { attendanceCsv } from "../attendance"

// Regression (#567): text from the public sign-up form (names, comments, answers, phone numbers)
// reached the CSV exports as is, so a value like =HYPERLINK(...) ran as a formula in Excel or
// LibreOffice. Every text cell that could start a formula is now prefixed with an apostrophe.

const PAYLOADS = [
  "=1+1",
  "+41 79 123 45 67",
  "-2+3",
  "@SUM(A1:A2)",
  " =1+1",
  "\t=1+1",
  "\r=1+1",
  "\n=1+1",
  "\tplain",
  "\rplain",
  '=HYPERLINK("http://evil.example","x")',
  "=cmd|' /C calc'!A0",
]

/** Splits a semicolon CSV produced by csvDocument into rows of unquoted cells. */
function parse(csv: string): string[][] {
  const text = csv.replace(/^﻿/, "")
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ";") { row.push(cell); cell = "" }
    else if (c === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++ }
    else cell += c
  }
  return rows
}

/** What a spreadsheet would evaluate: a cell that still starts a formula once read. */
const runsAsFormula = (cell: string) => /^(?:[\t\r]|\s*[=+\-@])/.test(cell)

describe("csvCell formula neutralisation", () => {
  it.each(PAYLOADS)("prefixes %j with an apostrophe", (payload) => {
    const [[cell]] = parse(csvDocument(["h"], [[payload]])).slice(1)
    expect(cell).toBe(`'${payload}`)
    expect(runsAsFormula(cell)).toBe(false)
  })

  it("keeps ordinary values unchanged", () => {
    for (const v of ["Jean-Pierre", "Zoé", "a@b.ch", "079 123 45 67", "10:00", "2026-07-04", "oui", "", "x=1", "Bar - soir"]) {
      expect(csvCell(v)).toBe(v)
    }
    expect(csvCell(null)).toBe("")
    expect(csvCell(undefined)).toBe("")
  })

  it("writes numbers as numbers, negative ones included", () => {
    expect(csvCell(3)).toBe("3")
    expect(csvCell(-1)).toBe("-1")
  })

  it("still quotes separators, quotes and line breaks, after neutralising", () => {
    expect(csvCell('a;b "c"')).toBe('"a;b ""c"""')
    expect(csvCell("=1;2")).toBe(`"'=1;2"`)
    expect(csvCell('=A1&"x"')).toBe(`"'=A1&""x"""`)
    expect(csvCell("\r=1")).toBe(`"'\r=1"`)
  })

  it("neutralises header cells too", () => {
    expect(csvDocument(["=1+1"], []).replace(/^﻿/, "")).toBe("'=1+1\r\n")
  })
})

describe("members export", () => {
  it("neutralises every text column a member's data can fill", () => {
    const p = "=1+1"
    const csv = membersCsv([{
      firstName: p, lastName: "+1", email: "@x", phone: "+41 79 123 45 67", tags: ["=tag"], active: true, notes: "-note",
      birthDate: null, availabilityPeriods: ["morning"], availabilityNote: " =1", createdAt: "2026-06-01T10:00:00Z", registrationCount: 2,
    }], "Europe/Zurich")
    const [, row] = parse(csv)
    expect(row[0]).toBe("'=1+1")
    expect(row[1]).toBe("'+1")
    expect(row[2]).toBe("'@x")
    expect(row[3]).toBe("'+41 79 123 45 67")
    expect(row[4]).toBe("'=tag")
    expect(row[8]).toBe("' =1")
    expect(row[9]).toBe("'-note")
    expect(row[10]).toBe("2")
    expect(row.some(runsAsFormula)).toBe(false)
  })
})

describe("activity export", () => {
  it("neutralises the actor label and the logged values", () => {
    const csv = activityCsv([{
      createdAt: "2026-06-01T10:00:00Z", actorType: "volunteer", actorLabel: "=evil", action: "registration.created",
      entityType: "Registration", entityId: "@id", changes: { comment: "=1+1" },
    }], "Europe/Zurich")
    const [, row] = parse(csv)
    expect(row[1]).toBe("'=evil")
    expect(row[5]).toBe("'@id")
    expect(row[6]).toBe('{"comment":"=1+1"}')
    expect(row.some(runsAsFormula)).toBe(false)
  })
})

describe("attendance export", () => {
  const base = {
    firstName: "Alice", lastName: "Martin", email: "a@x.ch", phone: null, roleName: "Bar", label: "Bar",
    date: "04.07.2026", startTime: "10:00", endTime: "12:00", checkedInAt: null,
  }

  it("neutralises names, contact, shift labels, answers and question labels", () => {
    const csv = attendanceCsv(
      [{ ...base, firstName: "=1+1", lastName: "\t=x", email: "@x", phone: "+41 79 123 45 67", roleName: "-role", label: "=label", answers: ["=answer", "\r=1"] }],
      "Europe/Zurich",
      ["=Q1", "Taille ?"],
    )
    const [header, row] = parse(csv)
    expect(header.slice(-2)).toEqual(["'=Q1", "Taille ?"])
    expect(row.slice(0, 6)).toEqual(["'=1+1", "'\t=x", "'@x", "'+41 79 123 45 67", "'-role", "'=label"])
    // A lone carriage return stays inside the quoted cell, after the apostrophe.
    expect(row.slice(-2)).toEqual(["'=answer", "'\r=1"])
    expect([...header, ...row].some(runsAsFormula)).toBe(false)
  })

  it("leaves an ordinary sheet as it was", () => {
    const csv = attendanceCsv([{ ...base, checkedInAt: null, answers: ["M"] }], "Europe/Zurich", ["Taille"])
    expect(csv).toBe("﻿Prénom;Nom;Email;Téléphone;Poste;Créneau;Date;Début;Fin;Présent;Pointé le;Taille\r\nAlice;Martin;a@x.ch;;Bar;;04.07.2026;10:00;12:00;non;;M\r\n")
  })
})

describe("attendance export, multi-line answers", () => {
  it("turns line breaks into spaces, then neutralises", () => {
    const csv = attendanceCsv([{
      firstName: "A", lastName: "B", email: null, phone: null, roleName: "Bar", label: "Bar",
      date: "04.07.2026", startTime: "10:00", endTime: "12:00", checkedInAt: null, answers: ["\n=1+1"],
    }], "Europe/Zurich", ["Q"])
    const [, row] = parse(csv)
    expect(row.at(-1)).toBe("' =1+1")
  })
})

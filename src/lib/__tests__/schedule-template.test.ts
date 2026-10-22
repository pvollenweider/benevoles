// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "node:fs"
import path from "node:path"
import ExcelJS from "exceljs"
import JSZip from "jszip"
import { describe, expect, it } from "vitest"
import {
  EXAMPLE_ROLES, HELP_SHEET, NAME_ROWS, PLANNING_SHEET, SUMMARY_SHEET,
  buildScheduleWorkbook, dayColumns, dayHeaderFormula, scheduleLayout, slotFormulas, summaryDayFormula, summaryRoleFormula,
} from "@/lib/schedule-template"

/** exceljs reads the conditional formats back but leaves them out of its typings. */
type ConditionalFormat = { ref: string; rules: { type: string; formulae?: string[] }[] }
const conditionalFormats = (ws: ExcelJS.Worksheet) => (ws as unknown as { conditionalFormattings: ConditionalFormat[] }).conditionalFormattings

const XLSX = path.join(process.cwd(), "public/modeles/modele-planning-benevoles.xlsx")
const ODS = path.join(process.cwd(), "public/modeles/modele-planning-benevoles.ods")

describe("the schedule template layout (#870)", () => {
  it("places each role's header, then per slot Besoin, the name rows, Inscrits and Manque", () => {
    const [accueil, buvette] = scheduleLayout(EXAMPLE_ROLES)
    expect(accueil.header).toBe(6)
    expect(accueil.slots[0]).toMatchObject({ besoin: 7, names: [8, 13], inscrits: 14, manque: 15 })
    expect(accueil.slots[1]).toMatchObject({ besoin: 16, names: [17, 22], inscrits: 23, manque: 24 })
    // An empty row between two blocks.
    expect(buvette.header).toBe(26)
  })

  it("follows the number of name rows", () => {
    const [block] = scheduleLayout([{ name: "Bar", slots: [{ label: "x", targets: [] }] }], 3)
    expect(block.slots[0]).toMatchObject({ besoin: 7, names: [8, 10], inscrits: 11, manque: 12 })
  })

  it("has one column per day, D to J", () => {
    expect(dayColumns()).toEqual(["D", "E", "F", "G", "H", "I", "J"])
  })
})

describe("the schedule template formulas", () => {
  const slot = { besoin: 7, names: [8, 13] as [number, number], inscrits: 14 }

  it("counts the names and what is missing, blank on a day without a target and never below zero", () => {
    expect(slotFormulas(slot, "E")).toEqual({ inscrits: "COUNTA(E8:E13)", manque: 'IF(E7="","",MAX(0,E7-E14))' })
  })

  it("names the days in French without depending on the program's language", () => {
    expect(dayHeaderFormula(0)).toMatch(/^IF\(\$B\$3="","Jour 1",CHOOSE\(WEEKDAY\(\$B\$3,2\),"lundi",/)
    expect(dayHeaderFormula(6)).toContain('"Jour 7"')
    expect(dayHeaderFormula(6)).toContain("($B$3+6)")
    expect(dayHeaderFormula(3)).not.toMatch(/TEXT\(/)
  })

  it("adds up the Planning rows by kind and by role", () => {
    expect(summaryDayFormula("Manque", "D")).toBe(`SUMIF('Planning'!$C:$C,"Manque",'Planning'!D:D)`)
    expect(summaryRoleFormula("$A10", "F")).toBe(`SUMIFS('Planning'!F:F,'Planning'!$A:$A,$A10,'Planning'!$C:$C,"Manque")`)
  })
})

describe("the published template files", () => {
  it("is a workbook without macros", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(XLSX))
    expect(Object.keys(zip.files).some((f) => /vbaProject|\.bin$/i.test(f))).toBe(false)
    const contentTypes = await zip.file("[Content_Types].xml")!.async("string")
    expect(contentTypes).not.toContain("macroEnabled")
  })

  it("has the help, planning and summary sheets, in that order", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(XLSX)
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([HELP_SHEET, PLANNING_SHEET, SUMMARY_SHEET])
  })

  it("is the generator's current output (regenerate it with scripts/generate-schedule-template.mjs)", async () => {
    const committed = new ExcelJS.Workbook()
    await committed.xlsx.readFile(XLSX)
    const fresh = buildScheduleWorkbook()
    for (const name of [HELP_SHEET, PLANNING_SHEET, SUMMARY_SHEET]) {
      const a = committed.getWorksheet(name)!
      const b = fresh.getWorksheet(name)!
      const cells = (ws: ExcelJS.Worksheet) => {
        const out: Record<string, unknown> = {}
        ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
          const v = cell.value as { formula?: string } | string | number | null
          out[cell.address] = typeof v === "object" && v && "formula" in v ? `=${v.formula}` : v
        }))
        return out
      }
      expect(cells(a), name).toEqual(cells(b))
    }
  })

  it("colours every Manque and Inscrits row", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(XLSX)
    const ws = wb.getWorksheet(PLANNING_SHEET)!
    const refs = conditionalFormats(ws).map((cf) => cf.ref)
    const slots = scheduleLayout(EXAMPLE_ROLES).flatMap((b) => b.slots)
    for (const s of slots) {
      expect(refs).toContain(`D${s.manque}:J${s.manque}`)
      expect(refs).toContain(`D${s.inscrits}:J${s.inscrits}`)
    }
  })

  // Regression: « cellIs > 0 » painted the empty Manque cell of a day without a slot red in
  // Excel, which ranks the text "" above every number.
  it("paints Manque red only on a day with a target", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(XLSX)
    const ws = wb.getWorksheet(PLANNING_SHEET)!
    for (const s of scheduleLayout(EXAMPLE_ROLES).flatMap((b) => b.slots)) {
      const cf = conditionalFormats(ws).find((c) => c.ref === `D${s.manque}:J${s.manque}`)!
      for (const rule of cf.rules) {
        expect(rule.type).toBe("expression")
        expect(rule.formulae?.[0]).toContain(`D${s.besoin}<>""`)
      }
    }
  })

  it("names the right type and size in the page's download links", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "MODELE-PLANNING-BENEVOLES.md"), "utf-8")
    const links = [...page.matchAll(/\(\.(xlsx|ods), (\d+) Ko\)\]\((\/modeles\/[a-z-]+\.(xlsx|ods))\)/g)]
    expect(links.length).toBeGreaterThanOrEqual(2)
    for (const [, type, size, href, ext] of links) {
      expect(ext, href).toBe(type)
      const bytes = fs.statSync(path.join(process.cwd(), "public", href)).size
      expect(Number(size), href).toBe(Math.ceil(bytes / 1000))
    }
  })

  it("gives every slot the same number of name rows as the help sheet says", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(XLSX)
    const help = wb.getWorksheet(HELP_SHEET)!
    const text = help.getColumn(1).values.join("\n")
    expect(text).toContain(`« Nom ${NAME_ROWS} »`)
  })

  it("has its .ods copy", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(ODS))
    expect(await zip.file("mimetype")!.async("string")).toBe("application/vnd.oasis.opendocument.spreadsheet")
  })
})

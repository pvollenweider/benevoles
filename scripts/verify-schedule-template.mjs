// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Checks the formulas of the volunteer schedule template (#870) with LibreOffice: fills a copy of
// the template with test data, lets LibreOffice compute it (export of every sheet to CSV), and
// compares each « Inscrits », « Manque » and summary cell with the value computed here. The same is
// done for the .ods copy, unfilled. Needs LibreOffice; SOFFICE_CMD names the command, e.g.
//   node scripts/verify-schedule-template.mjs
//   SOFFICE_CMD="docker run --rm -v $PWD:/w -w /w <image with libreoffice> soffice" node scripts/verify-schedule-template.mjs
// Run from the repository root (the work folder, .schedule-template-check/, is relative to it).
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import ExcelJS from "exceljs"
import { EXAMPLE_ROLES, PLANNING_SHEET, SUMMARY_SHEET, dayColumns, scheduleLayout } from "../src/lib/schedule-template.ts"

const WORK = ".schedule-template-check"
const TEMPLATE = "public/modeles/modele-planning-benevoles.xlsx"
const ODS = "public/modeles/modele-planning-benevoles.ods"
// Split on spaces and run without a shell: the command and its arguments, then ours.
const [SOFFICE, ...SOFFICE_ARGS] = (process.env.SOFFICE_CMD ?? "soffice").trim().split(/\s+/)

fs.rmSync(WORK, { recursive: true, force: true })
fs.mkdirSync(WORK)

const layout = scheduleLayout(EXAMPLE_ROLES)
const days = dayColumns()

// Test data: for each slot and day, how many names to write (0 to 7, one more than some targets),
// and one name on a day without a target (it must count in « Inscrits », never in « Manque »).
const filled = layout.flatMap((block, b) => block.slots.flatMap((slot, s) => days.map((col, d) => ({ slot, col, d, names: (b * 3 + s * 2 + d) % 8 }))))
const expected = new Map()
for (const { slot, col, d, names } of filled) {
  const n = Math.min(names, slot.names[1] - slot.names[0] + 1)
  const target = slot.targets[d]
  expected.set(`${col}${slot.inscrits}`, n)
  expected.set(`${col}${slot.manque}`, target == null ? "" : Math.max(0, target - n))
}

async function writeFilled() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(TEMPLATE)
  const ws = wb.getWorksheet(PLANNING_SHEET)
  ws.getCell("B3").value = new Date(Date.UTC(2027, 5, 14))
  for (const { slot, col, names } of filled) {
    for (let i = 0; i < Math.min(names, slot.names[1] - slot.names[0] + 1); i++) ws.getCell(`${col}${slot.names[0] + i}`).value = `Test ${i + 1}`
  }
  await wb.xlsx.writeFile(path.join(WORK, "filled.xlsx"))
}

function computeCsv(file) {
  // Every sheet to its own CSV (sheet -1), as displayed (formatted values), UTF-8.
  const filter = "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,true,false,false,-1"
  execFileSync(SOFFICE, [...SOFFICE_ARGS, "--headless", "--convert-to", filter, "--outdir", WORK, file], { stdio: "pipe" })
  const base = path.basename(file).replace(/\.[^.]+$/, "")
  const read = (sheet) => parseCsv(fs.readFileSync(path.join(WORK, `${base}-${sheet}.csv`), "utf-8"))
  return { planning: read(PLANNING_SHEET), summary: read(SUMMARY_SHEET) }
}

function parseCsv(text) {
  const rows = []
  let row = [], cell = "", quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ",") { row.push(cell); cell = "" }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = "" }
    else if (c !== "\r") cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

const at = (rows, ref) => {
  const m = /^([A-Z])(\d+)$/.exec(ref)
  return rows[Number(m[2]) - 1]?.[m[1].charCodeAt(0) - 65] ?? ""
}

let failures = 0
let checked = 0
function check(label, actual, want) {
  checked++
  if (String(actual) !== String(want)) {
    failures++
    console.error(`✖ ${label}: ${JSON.stringify(actual)}, expected ${JSON.stringify(want)}`)
  }
}

await writeFilled()
const { planning, summary } = computeCsv(path.join(WORK, "filled.xlsx"))
for (const [ref, want] of expected) check(`Planning!${ref}`, at(planning, ref), want)

// Summary, by day: the sums of the Besoin, Inscrits and Manque rows.
const sumCols = days.map((_, i) => String.fromCharCode(66 + i))
days.forEach((col, d) => {
  const slots = layout.flatMap((b) => b.slots)
  const besoin = slots.reduce((s, slot) => s + (slot.targets[d] ?? 0), 0)
  const inscrits = slots.reduce((s, slot) => s + Number(expected.get(`${col}${slot.inscrits}`)), 0)
  const manque = slots.reduce((s, slot) => s + Number(expected.get(`${col}${slot.manque}`) || 0), 0)
  check(`${SUMMARY_SHEET}!${sumCols[d]}4 (Besoin)`, at(summary, `${sumCols[d]}4`), besoin)
  check(`${SUMMARY_SHEET}!${sumCols[d]}5 (Inscrits)`, at(summary, `${sumCols[d]}5`), inscrits)
  check(`${SUMMARY_SHEET}!${sumCols[d]}6 (Manque)`, at(summary, `${sumCols[d]}6`), manque)
  layout.forEach((block, b) => {
    const want = block.slots.reduce((s, slot) => s + Number(expected.get(`${col}${slot.manque}`) || 0), 0)
    check(`${SUMMARY_SHEET}!${sumCols[d]}${10 + b} (${block.name})`, at(summary, `${sumCols[d]}${10 + b}`), want)
  })
})
layout.forEach((block, b) => check(`${SUMMARY_SHEET}!A${10 + b}`, at(summary, `A${10 + b}`), block.name))
// Day headers follow the first day (14/06/2027, a Monday).
check("Planning!D5", at(planning, "D5").toLowerCase(), "lundi 14/06")
check("Planning!J5", at(planning, "J5").toLowerCase(), "dimanche 20/06")

// The .ods copy, unfilled: every « Manque » equals its target, the headers read « Jour n ».
const ods = computeCsv(ODS)
for (const block of layout) for (const slot of block.slots) days.forEach((col, d) => {
  check(`ods Planning!${col}${slot.inscrits}`, at(ods.planning, `${col}${slot.inscrits}`), 0)
  check(`ods Planning!${col}${slot.manque}`, at(ods.planning, `${col}${slot.manque}`), slot.targets[d] ?? "")
})
check("ods Planning!D5", at(ods.planning, "D5"), "Jour 1")

if (failures) {
  console.error(`${failures} difference(s)`)
  process.exit(1)
}
console.log(`✓ ${checked} cells of the filled .xlsx and the .ods computed as expected by LibreOffice`)

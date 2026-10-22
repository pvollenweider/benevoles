// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import ExcelJS from "exceljs"

/**
 * The free volunteer schedule template (#870), offered on /modele-planning-benevoles: a workbook
 * without macros, written by scripts/generate-schedule-template.ts to
 * public/modeles/modele-planning-benevoles.xlsx (and converted to .ods with LibreOffice).
 *
 * The « Planning » sheet has one block per role and a column per day. Each time slot of a block is
 * a « Besoin » row (the number of people wanted that day), NAME_ROWS rows for the names, then
 * « Inscrits » (COUNTA of the names) and « Manque » (what is still missing, never below zero),
 * coloured by conditional formatting. Column A repeats the role and column B the slot on every
 * row of the slot (a formula pointing at the row above), so that the « Récapitulatif » sheet can
 * add up with SUMIF/SUMIFS, and so that a block copied below another follows its new header.
 * Only functions that Excel, LibreOffice and Google Sheets share: COUNTA, MAX, IF, AND, SUM,
 * SUMIF, SUMIFS, CHOOSE, WEEKDAY, DAY, MONTH, RIGHT.
 *
 * Plain TypeScript without path aliases: the generator script imports it directly.
 */

export type TemplateSlot = { label: string; targets: (number | null)[] }
export type TemplateRole = { name: string; slots: TemplateSlot[] }

/** Days of the week, one column each (D to J). */
export const DAY_COUNT = 7
/** Name rows per slot: enough for the usual slot, more are inserted between them. */
export const NAME_ROWS = 6
/** First day column (D). */
export const FIRST_DAY_COLUMN = 4
/** Header row of the « Planning » sheet; the blocks start below it. */
export const HEADER_ROW = 5

export const PLANNING_SHEET = "Planning"
export const SUMMARY_SHEET = "Récapitulatif"
export const HELP_SHEET = "Mode d'emploi"

/** The example roles of the template, replaced by the organiser's own. */
export const EXAMPLE_ROLES: readonly TemplateRole[] = [
  {
    name: "Accueil",
    slots: [
      { label: "9 h à 12 h", targets: [2, 2, 2, 2, 2, 3, 3] },
      { label: "14 h à 18 h", targets: [2, 2, 2, 2, 2, 3, 3] },
    ],
  },
  {
    name: "Buvette",
    slots: [
      { label: "11 h à 15 h", targets: [null, null, null, null, 3, 4, 4] },
      { label: "18 h à 23 h", targets: [null, null, null, null, 4, 4, null] },
    ],
  },
  {
    name: "Montage et rangement",
    slots: [{ label: "8 h à 12 h", targets: [null, null, null, null, 6, null, 6] }],
  },
]

export type SlotRows = { label: string; targets: (number | null)[]; besoin: number; names: [number, number]; inscrits: number; manque: number }
export type RoleBlock = { name: string; header: number; slots: SlotRows[] }

/** Row numbers of every block and slot of the « Planning » sheet. Pure. */
export function scheduleLayout(roles: readonly TemplateRole[], nameRows: number = NAME_ROWS): RoleBlock[] {
  let row = HEADER_ROW + 1
  return roles.map((role) => {
    const header = row++
    const slots = role.slots.map((slot) => {
      const besoin = row
      const names: [number, number] = [besoin + 1, besoin + nameRows]
      const inscrits = besoin + nameRows + 1
      const manque = inscrits + 1
      row = manque + 1
      return { label: slot.label, targets: slot.targets, besoin, names, inscrits, manque }
    })
    row++ // an empty row between two blocks
    return { name: role.name, header, slots }
  })
}

/** Column letter of a 1-based column number (A to Z is all the template needs). */
export function columnLetter(column: number): string {
  if (column < 1 || column > 26) throw new Error(`Column out of range: ${column}`)
  return String.fromCharCode(64 + column)
}

/** The day columns, D to J. */
export function dayColumns(): string[] {
  return Array.from({ length: DAY_COUNT }, (_, i) => columnLetter(FIRST_DAY_COLUMN + i))
}

/** The formulas of one slot for one day column: what « Inscrits » and « Manque » compute. */
export function slotFormulas(slot: Pick<SlotRows, "besoin" | "names" | "inscrits">, col: string): { inscrits: string; manque: string } {
  return {
    inscrits: `COUNTA(${col}${slot.names[0]}:${col}${slot.names[1]})`,
    manque: `IF(${col}${slot.besoin}="","",MAX(0,${col}${slot.besoin}-${col}${slot.inscrits}))`,
  }
}

const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

/**
 * A day's header: « lundi 14/06 » once the first day is filled in, « Jour n » until then. Text
 * built from WEEKDAY, DAY and MONTH rather than a date format: a format's day names and TEXT's
 * format codes follow the language of the spreadsheet program, these functions don't.
 */
export function dayHeaderFormula(index: number): string {
  const d = index === 0 ? "$B$3" : `($B$3+${index})`
  const names = WEEKDAYS.map((w) => `"${w}"`).join(",")
  return `IF($B$3="","Jour ${index + 1}",CHOOSE(WEEKDAY(${d},2),${names})&" "&RIGHT("0"&DAY(${d}),2)&"/"&RIGHT("0"&MONTH(${d}),2))`
}

/** A day's total on the « Récapitulatif » sheet, for one kind of row (Besoin, Inscrits, Manque). */
export function summaryDayFormula(kind: "Besoin" | "Inscrits" | "Manque", col: string): string {
  return `SUMIF('${PLANNING_SHEET}'!$C:$C,"${kind}",'${PLANNING_SHEET}'!${col}:${col})`
}

/** What is missing for one role on one day, on the « Récapitulatif » sheet. */
export function summaryRoleFormula(roleCell: string, col: string): string {
  return `SUMIFS('${PLANNING_SHEET}'!${col}:${col},'${PLANNING_SHEET}'!$A:$A,${roleCell},'${PLANNING_SHEET}'!$C:$C,"Manque")`
}

// Colours: the usual light fills of spreadsheet conditional formatting, dark text on each, all
// above 4.5:1. The numbers carry the information; the colour only helps to scan.
const RED = { fill: "FFFFC7CE", font: "FF9C0006" }
const GREEN = { fill: "FFC6EFCE", font: "FF006100" }
const AMBER = { fill: "FFFFEB9C", font: "FF7A4500" }
const HEADER_FILL = "FFE7E6E6"
const ROLE_FILL = "FFDDEBF7"
const MUTED_FONT = "FF595959"

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb }, bgColor: { argb } }
}

function cfStyle(colours: { fill: string; font: string }): Partial<ExcelJS.Style> {
  return { fill: { type: "pattern", pattern: "solid", bgColor: { argb: colours.fill } }, font: { color: { argb: colours.font }, bold: true } }
}

/** Help text of the « Mode d'emploi » sheet: one paragraph per row, headings in bold. */
export const HELP_LINES: readonly { text: string; heading?: boolean }[] = [
  { text: "Modèle de planning des bénévoles", heading: true },
  { text: "Ce modèle répartit vos bénévoles sur une semaine : un bloc par poste, une colonne par jour, le nombre de personnes voulu pour chaque créneau, les noms des inscrits, et ce qui manque encore, en chiffres et en couleur." },
  { text: "" },
  { text: "Remplir le planning", heading: true },
  { text: "1. Dans l'onglet « Planning », écrivez le nom de l'événement en B2 et la date du premier jour en B3 (par exemple 14/06/2027). Les en-têtes des jours se mettent à jour." },
  { text: "2. Remplacez les postes d'exemple (Accueil, Buvette, Montage et rangement) par les vôtres : le nom du poste s'écrit sur la ligne colorée du bloc, les lignes en dessous le reprennent." },
  { text: "3. Pour chaque créneau, écrivez son horaire dans la colonne B, sur la ligne « Besoin »." },
  { text: "4. Sur la ligne « Besoin », indiquez pour chaque jour le nombre de personnes voulu. Laissez la case vide si le créneau n'a pas lieu ce jour-là." },
  { text: "5. Écrivez un nom par case sur les lignes « Nom 1 » à « Nom 6 ». « Inscrits » et « Manque » se calculent seuls." },
  { text: "6. L'onglet « Récapitulatif » additionne le besoin, les inscrits et le manque par jour, et le manque par poste." },
  { text: "" },
  { text: "Lire les couleurs", heading: true },
  { text: "Ligne « Manque » en rouge : il manque encore des personnes sur ce créneau, ce jour-là. Le chiffre dit combien." },
  { text: "Ligne « Manque » en vert : le créneau a le nombre de personnes voulu." },
  { text: "Ligne « Inscrits » en jaune : plus de noms que de places prévues." },
  { text: "Une case vide sur la ligne « Besoin » : pas de créneau ce jour-là, rien n'est compté." },
  { text: "" },
  { text: "Adapter le modèle", heading: true },
  { text: "Plus de 6 noms sur un créneau : insérez des lignes entre « Nom 1 » et « Nom 6 » (pas en dessous de « Nom 6 »), le décompte les inclut." },
  { text: "Un créneau de plus : copiez les lignes d'un créneau, de « Besoin » à « Manque », et collez-les sous le dernier créneau du bloc." },
  { text: "Un poste de plus : copiez un bloc entier, de sa ligne colorée à sa ligne « Manque », collez-le sous le dernier bloc, puis changez le nom du poste sur la ligne colorée. Dans l'onglet « Récapitulatif », copiez une ligne du tableau « Manque par poste » et faites-la pointer sur la ligne colorée du nouveau bloc." },
  { text: "Une autre semaine : dupliquez l'onglet « Planning », ou enregistrez une copie du fichier." },
  { text: "" },
  { text: "Les limites d'un tableur", heading: true },
  { text: "Ce fichier ne prévient personne : les confirmations, les rappels et les changements d'horaire restent à envoyer à la main. Si plusieurs personnes le modifient en même temps ou s'en échangent des copies, vérifiez que tout le monde travaille sur la même version." },
  { text: "Les coordonnées que vous y ajoutez sont des données personnelles : ne partagez le fichier qu'avec les personnes qui en ont besoin." },
  { text: "" },
  { text: "Modèle proposé par benevol.app : https://www.benevol.app/modele-planning-benevoles" },
]

/** The template workbook, ready to be written. */
export function buildScheduleWorkbook(roles: readonly TemplateRole[] = EXAMPLE_ROLES): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = "benevol.app"
  wb.title = "Modèle de planning des bénévoles"
  wb.subject = "Planning des bénévoles sur une semaine"
  // Fixed dates: regenerating the template without changes gives the same content.
  wb.created = new Date("2026-10-22T00:00:00Z")
  wb.modified = new Date("2026-10-22T00:00:00Z")
  wb.calcProperties = { fullCalcOnLoad: true }

  addHelpSheet(wb)
  const layout = scheduleLayout(roles)
  addPlanningSheet(wb, layout)
  addSummarySheet(wb, layout)
  return wb
}

function addHelpSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(HELP_SHEET, { properties: { tabColor: { argb: "FF4472C4" } } })
  ws.getColumn(1).width = 110
  HELP_LINES.forEach((line, i) => {
    const cell = ws.getCell(i + 1, 1)
    cell.value = line.text
    cell.alignment = { wrapText: true, vertical: "top" }
    if (line.heading) cell.font = { bold: true, size: i === 0 ? 16 : 13 }
  })
}

function addPlanningSheet(wb: ExcelJS.Workbook, layout: RoleBlock[]) {
  const ws = wb.addWorksheet(PLANNING_SHEET, {
    views: [{ state: "frozen", xSplit: 3, ySplit: HEADER_ROW, activeCell: "B2" }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}` },
  })
  const days = dayColumns()
  ws.getColumn(1).width = 24
  ws.getColumn(2).width = 16
  ws.getColumn(3).width = 10
  for (const col of days) ws.getColumn(col).width = 16

  ws.getCell("A1").value = "Planning des bénévoles"
  ws.getCell("A1").font = { bold: true, size: 16 }
  ws.getCell("A2").value = "Événement"
  ws.getCell("B2").value = "Fête d'été (exemple)"
  ws.getCell("A3").value = "Premier jour"
  ws.getCell("B3").numFmt = "dd/mm/yyyy"
  ws.getCell("B3").dataValidation = {
    type: "date", operator: "greaterThan", formulae: [new Date("2000-01-01T00:00:00Z")], allowBlank: true,
    showErrorMessage: true, errorTitle: "Date attendue", error: "Écrivez une date, par exemple 14/06/2027.",
    showInputMessage: true, promptTitle: "Premier jour", prompt: "La date du premier jour de la semaine, par exemple 14/06/2027. Les en-têtes des jours la suivent.",
  }
  for (const ref of ["A2", "A3"]) ws.getCell(ref).font = { bold: true }

  const header = ws.getRow(HEADER_ROW)
  header.values = ["Poste", "Créneau", "Ligne"]
  days.forEach((col, i) => {
    const cell = ws.getCell(`${col}${HEADER_ROW}`)
    cell.value = { formula: dayHeaderFormula(i) }
  })
  header.eachCell({ includeEmpty: true }, (cell, n) => {
    if (n > FIRST_DAY_COLUMN + DAY_COUNT - 1) return
    cell.font = { bold: true }
    cell.fill = fill(HEADER_FILL)
    cell.alignment = { horizontal: n >= FIRST_DAY_COLUMN ? "center" : "left" }
  })

  for (const block of layout) {
    const head = ws.getCell(`A${block.header}`)
    head.value = block.name
    for (let c = 1; c <= FIRST_DAY_COLUMN + DAY_COUNT - 1; c++) ws.getCell(block.header, c).fill = fill(ROLE_FILL)
    head.font = { bold: true }

    for (const slot of block.slots) {
      for (let r = slot.besoin; r <= slot.manque; r++) {
        const a = ws.getCell(`A${r}`)
        a.value = { formula: `A${r - 1}` }
        a.font = { color: { argb: MUTED_FONT } }
        const b = ws.getCell(`B${r}`)
        if (r === slot.besoin) b.value = slot.label
        else {
          b.value = { formula: `B${r - 1}` }
          b.font = { color: { argb: MUTED_FONT } }
        }
      }
      ws.getCell(`C${slot.besoin}`).value = "Besoin"
      for (let n = 0; n <= slot.names[1] - slot.names[0]; n++) ws.getCell(`C${slot.names[0] + n}`).value = `Nom ${n + 1}`
      ws.getCell(`C${slot.inscrits}`).value = "Inscrits"
      ws.getCell(`C${slot.manque}`).value = "Manque"
      for (const r of [slot.besoin, slot.inscrits, slot.manque]) ws.getCell(`C${r}`).font = { bold: true }

      days.forEach((col, i) => {
        const target = ws.getCell(`${col}${slot.besoin}`)
        target.value = slot.targets[i] ?? null
        target.alignment = { horizontal: "center" }
        target.font = { bold: true }
        target.dataValidation = {
          type: "whole", operator: "between", formulae: [0, 99], allowBlank: true,
          showInputMessage: true, promptTitle: "Besoin", prompt: "Le nombre de personnes voulu ce jour-là. Laissez vide si le créneau n'a pas lieu.",
          showErrorMessage: true, errorTitle: "Nombre attendu", error: "Le besoin est un nombre de personnes, de 0 à 99. Laissez la case vide si le créneau n'a pas lieu ce jour-là.",
        }
        const f = slotFormulas(slot, col)
        Object.assign(ws.getCell(`${col}${slot.inscrits}`), { value: { formula: f.inscrits }, alignment: { horizontal: "center" } })
        Object.assign(ws.getCell(`${col}${slot.manque}`), { value: { formula: f.manque }, alignment: { horizontal: "center" } })
      })
      const first = days[0]
      const last = days[days.length - 1]
      ws.addConditionalFormatting({
        ref: `${first}${slot.manque}:${last}${slot.manque}`,
        rules: [
          // An expression, not « cellIs > 0 »: on a day without a slot the cell holds "", and Excel
          // ranks text above every number, so "" > 0 would paint an empty cell red.
          { type: "expression", formulae: [`AND(${first}${slot.besoin}<>"",${first}${slot.manque}>0)`], style: cfStyle(RED), priority: 1 },
          { type: "expression", formulae: [`AND(${first}${slot.besoin}<>"",${first}${slot.manque}=0)`], style: cfStyle(GREEN), priority: 2 },
        ],
      })
      ws.addConditionalFormatting({
        ref: `${first}${slot.inscrits}:${last}${slot.inscrits}`,
        rules: [{ type: "expression", formulae: [`AND(${first}${slot.besoin}<>"",${first}${slot.inscrits}>${first}${slot.besoin})`], style: cfStyle(AMBER), priority: 3 }],
      })
      for (let c = 1; c <= FIRST_DAY_COLUMN + DAY_COUNT - 1; c++) {
        ws.getCell(slot.manque, c).border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } }
      }
    }
  }
}

function addSummarySheet(wb: ExcelJS.Workbook, layout: RoleBlock[]) {
  const ws = wb.addWorksheet(SUMMARY_SHEET, { views: [{ state: "frozen", xSplit: 1, ySplit: 3 }] })
  const days = dayColumns()
  // The summary's own day columns: B to H, then the week's total in I.
  const cols = Array.from({ length: DAY_COUNT }, (_, i) => columnLetter(2 + i))
  const total = columnLetter(2 + DAY_COUNT)
  ws.getColumn(1).width = 26
  for (const col of [...cols, total]) ws.getColumn(col).width = 16

  ws.getCell("A1").value = "Récapitulatif de la semaine"
  ws.getCell("A1").font = { bold: true, size: 16 }

  const head = (row: number, label: string) => {
    ws.getCell(`A${row}`).value = label
    cols.forEach((col, i) => {
      const cell = ws.getCell(`${col}${row}`)
      cell.value = { formula: `'${PLANNING_SHEET}'!${days[i]}${HEADER_ROW}` }
    })
    ws.getCell(`${total}${row}`).value = "Semaine"
    ws.getRow(row).eachCell({ includeEmpty: true }, (cell, n) => {
      if (n > 2 + DAY_COUNT) return
      cell.font = { bold: true }
      cell.fill = fill(HEADER_FILL)
      cell.alignment = { horizontal: n === 1 ? "left" : "center" }
    })
  }

  head(3, "Par jour")
  const kinds = ["Besoin", "Inscrits", "Manque"] as const
  kinds.forEach((kind, k) => {
    const row = 4 + k
    ws.getCell(`A${row}`).value = kind
    ws.getCell(`A${row}`).font = { bold: true }
    cols.forEach((col, i) => Object.assign(ws.getCell(`${col}${row}`), { value: { formula: summaryDayFormula(kind, days[i]) }, alignment: { horizontal: "center" } }))
    Object.assign(ws.getCell(`${total}${row}`), { value: { formula: `SUM(${cols[0]}${row}:${cols[cols.length - 1]}${row})` }, alignment: { horizontal: "center" }, font: { bold: true } })
  })
  const manqueRow = 6

  const roleHead = 9
  head(roleHead, "Manque par poste")
  layout.forEach((block, b) => {
    const row = roleHead + 1 + b
    ws.getCell(`A${row}`).value = { formula: `'${PLANNING_SHEET}'!A${block.header}` }
    cols.forEach((col, i) => Object.assign(ws.getCell(`${col}${row}`), { value: { formula: summaryRoleFormula(`$A${row}`, days[i]) }, alignment: { horizontal: "center" } }))
    Object.assign(ws.getCell(`${total}${row}`), { value: { formula: `SUM(${cols[0]}${row}:${cols[cols.length - 1]}${row})` }, alignment: { horizontal: "center" }, font: { bold: true } })
  })
  const lastRole = roleHead + layout.length

  for (const ref of [`${cols[0]}${manqueRow}:${total}${manqueRow}`, `${cols[0]}${roleHead + 1}:${total}${lastRole}`]) {
    ws.addConditionalFormatting({ ref, rules: [{ type: "cellIs", operator: "greaterThan", formulae: ["0"], style: cfStyle(RED), priority: 1 }] })
  }
}

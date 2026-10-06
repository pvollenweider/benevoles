// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Run with the bundled artifact-tool runtime, not repository spreadsheet dependencies.
import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"
const runtimeRoot = process.env.VIDEO_ARTIFACT_RUNTIME
if (!runtimeRoot) throw new Error("Set VIDEO_ARTIFACT_RUNTIME to the bundled Node dependency directory")
const require = createRequire(path.join(runtimeRoot, "package.json"))
const { Workbook, SpreadsheetFile } = await import(require.resolve("@oai/artifact-tool"))
const JSZip = require("jszip")
const output = path.resolve("videos/fixtures/member-import")
await fs.mkdir(output, { recursive: true })
const header = ["Prénom", "Nom", "Email", "Téléphone", "Tags"]
const rows = Array.from({ length: 40 }, (_, index) => [
  ["Émilie", "Sophie", "Théo", "Anaïs", "Léon"][index % 5],
  `Mercier ${index + 1}`,
  `import.membre.${index}@example.org`,
  `+41 79 000 ${String(index).padStart(2, "0")} 00`,
  index % 2 ? "accueil" : "logistique, permis-b",
])
rows[0] = ["Camille", "Rochat", "camille.rochat@example.org", "+41 79 000 10 01", "accueil, habitué"]
rows[1] = ["Julien", "Favre", "julien.favre@example.org", "+41 79 000 10 02", "logistique"]
rows[2] = ["René", "Sansmail", "", "+41 79 000 10 03", "accueil"]
rows[4][0] = ""
rows[5][2] = "adresse-incomplete"
rows[7][2] = rows[6][2]
rows[8][0] = "=1+1"
const corrected = rows.map(row => [...row])
corrected[4][0] = "Aline"
corrected[5][2] = "import.membre.5@example.org"
corrected[7][2] = "import.membre.7@example.org"
corrected[8][0] = "Maya"
const csv = matrix => matrix.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n"
for (const [name, data] of [["membres-a-verifier", rows], ["membres-corriges", corrected]]) {
  const wb = Workbook.create()
  const sheet = wb.worksheets.add("Membres")
  sheet.showGridLines = false
  // Literal formula-looking test data, not an executable Excel formula.
  const safe = data.map(row => row.map(value => value.startsWith("=") ? `'${value}` : value))
  sheet.getRange("A1:E41").values = [header, ...safe]
  sheet.getRange("A1:E41").format.font = { name: "Arial", size: 11 }
  sheet.getRange("A1:E41").format.rowHeight = 23
  sheet.getRange("A1:E1").format = { fill: "#164E63", font: { name: "Arial", size: 11, bold: true, color: "#FFFFFF" } }
  sheet.getRange("A1:B41").format.columnWidth = 20
  sheet.getRange("C1:C41").format.columnWidth = 35
  sheet.getRange("D1:E41").format.columnWidth = 25
  sheet.freezePanes.freezeRows(1)
  wb.recalculate()
  const formulas = sheet.getRange("A1:E41").formulas
  if (formulas.flat().some(Boolean)) throw new Error("Import fixtures must contain no executable formulas")
  const preview = await wb.render({ sheetName: "Membres", range: "A1:E12", scale: 1.5, format: "png" })
  await fs.writeFile(path.join(output, `${name}.png`), new Uint8Array(await preview.arrayBuffer()))
  const xlsx = await SpreadsheetFile.exportXlsx(wb)
  const xlsxPath = path.join(output, `${name}.xlsx`)
  await xlsx.save(xlsxPath)
  // ExcelJS's reader expects unprefixed SpreadsheetML element names. Preserve
  // the namespace URI, data and formatting; only normalize equivalent XML names.
  const archive = await JSZip.loadAsync(await fs.readFile(xlsxPath))
  for (const [entryName, entry] of Object.entries(archive.files)) {
    if (!entryName.endsWith(".xml")) continue
    const xml = await entry.async("string")
    if (!xml.includes('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) continue
    archive.file(entryName, xml.replace(/xmlns:x=/g, "xmlns=").replace(/(<\/?)(x:)/g, "$1"))
  }
  await fs.writeFile(xlsxPath, await archive.generateAsync({ type: "nodebuffer" }))
  await fs.writeFile(path.join(output, `${name}.csv`), csv([header, ...data]))
}
await fs.writeFile(path.join(output, "fixture-expectations.json"), JSON.stringify({ rowsPerFile: 40, fictionalData: true, errors: { missingFirstName: 6, invalidEmail: 7, repeatedEmail: 9 }, formulaLookingTextLine: 10, columns: header, availabilityImportSupported: false }, null, 2))
console.log("Created two XLSX/CSV import fixtures, each with 40 fictional member rows and rendered previews")

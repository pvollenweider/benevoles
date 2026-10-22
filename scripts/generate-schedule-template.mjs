// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Writes the free volunteer schedule template (#870, src/lib/schedule-template.ts) to
// public/modeles/modele-planning-benevoles.xlsx. The .ods copy is a LibreOffice conversion of it:
//   node scripts/generate-schedule-template.ts
//   soffice --headless --convert-to ods --outdir public/modeles public/modeles/modele-planning-benevoles.xlsx
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildScheduleWorkbook } from "../src/lib/schedule-template.ts"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const out = path.join(root, "public/modeles/modele-planning-benevoles.xlsx")
await buildScheduleWorkbook().xlsx.writeFile(out)
console.log(`✓ ${path.relative(root, out)}`)

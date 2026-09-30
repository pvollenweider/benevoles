// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Regenerates the retention tables of GUIDE_ADMIN.md and docs/retention.md from src/lib/retention.ts (#486).
import fs from "node:fs"
import { retentionGuideTable, retentionMatrixTable, withTable } from "../src/lib/retention"

for (const [file, table] of [["GUIDE_ADMIN.md", retentionGuideTable()], ["docs/retention.md", retentionMatrixTable()]] as const) {
  fs.writeFileSync(file, withTable(fs.readFileSync(file, "utf-8"), table))
  console.log(`updated ${file}`)
}

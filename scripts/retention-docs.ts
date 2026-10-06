// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Regenerates the retention tables of the organisers' documentation (RETENTION_GUIDE_SOURCE) and
// docs/retention.md from src/lib/retention.ts (#486).
import fs from "node:fs"
import { RETENTION_GUIDE_SOURCE, retentionGuideTable, retentionMatrixTable, withTable } from "../src/lib/retention"

for (const [file, table] of [[RETENTION_GUIDE_SOURCE, retentionGuideTable()], ["docs/retention.md", retentionMatrixTable()]] as const) {
  fs.writeFileSync(file, withTable(fs.readFileSync(file, "utf-8"), table))
  console.log(`updated ${file}`)
}

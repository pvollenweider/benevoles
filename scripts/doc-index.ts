// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Regenerates the list of guide/README.md from the units of guide/ (#649, src/lib/doc-units.ts).
import fs from "node:fs"
import path from "node:path"
import { DOC_INDEX_FILE, DOC_UNITS_DIR, docIndexMarkdown, readDocUnits, withDocIndex } from "../src/lib/doc-units"

const file = path.join(DOC_UNITS_DIR, DOC_INDEX_FILE)
fs.writeFileSync(file, withDocIndex(fs.readFileSync(file, "utf-8"), docIndexMarkdown(readDocUnits())))
console.log(`updated ${file}`)

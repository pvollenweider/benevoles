// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Normalize OpenXML names only; preserve every cell, style and other ZIP entry.
import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"
import { createHash } from "node:crypto"
const runtime = process.env.VIDEO_ARTIFACT_RUNTIME
if (!runtime) throw new Error("VIDEO_ARTIFACT_RUNTIME must point to the bundled dependency directory")
const require = createRequire(path.join(runtime, "package.json"))
const JSZip = require("jszip")
const directory = path.resolve("videos/fixtures/member-import/v2")
for (const name of ["membres-a-verifier", "membres-corriges"]) {
 const file = path.join(directory, `${name}.xlsx`)
 const before = await fs.readFile(file)
 const zip = await JSZip.loadAsync(before)
 let changed = 0
 for (const [entryName, entry] of Object.entries(zip.files)) {
  if (!entryName.endsWith(".xml")) continue
  const xml = await entry.async("string")
  if (!xml.includes('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) continue
  zip.file(entryName, xml.replace(/xmlns:x=/g, "xmlns=").replace(/(<\/?)(x:)/g, "$1"))
  changed++
 }
 if (!changed) { console.log(`${name}: already normalized`); continue }
 const after = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } })
 await fs.writeFile(file, after)
 console.log(`${name}: ${changed} equivalent XML namespace changes; SHA256 ${createHash("sha256").update(after).digest("hex")}`)
}

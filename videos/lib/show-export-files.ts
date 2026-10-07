// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { parse } from "csv-parse/sync"
import type { Page } from "playwright"

const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

/** Actual CSV values only; explicitly not Excel or application UI, no conversion or edits. */
export async function showMembersCsv(page: Page, file: string) {
  const bytes = await readFile(file)
  const [headers, ...rows] = parse(bytes, { bom: true, delimiter: ";", relax_column_count: false }) as string[][]
  if (headers.length !== 14 || headers[0] !== "Prénom" || headers[9] !== "Notes" || headers[12] !== "Derniers envois (résultat)" || headers[13] !== "Convention acceptée (dernière fois)" || !rows.length) throw new Error("Actual current-main member CSV required")
  await page.setContent(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Lecture du CSV des membres</title><style>
  body{font:18px Arial,sans-serif;background:white;color:#172033;margin:24px}h1{font-size:26px}p{line-height:1.5}.scroll{max-height:510px;overflow:auto;border:1px solid #aab3c0}table{border-collapse:collapse;white-space:nowrap}td,th{padding:12px 16px;border-bottom:1px solid #dce1e8;text-align:left}th{background:#172033;color:white;position:sticky;top:0}tbody tr:nth-child(even){background:#f2f5f9}caption{text-align:left;padding:12px;font-weight:bold}
  </style></head><body><h1>Lecture du CSV des membres</h1><p>Visualiseur de démonstration, pas un écran de l’application ni un tableur. Le fichier est inchangé.</p><p>${rows.length} fiches · ${headers.length} colonnes. Une ligne par membre ; les fiches désactivées sont conservées.</p><div class="scroll"><table><caption>Fichier téléchargé — données fictives</caption><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></body></html>`)
  await page.evaluate(() => document.fonts.ready)
  if (await page.locator("tbody tr").count() !== rows.length) throw new Error("CSV viewer omitted a row")
  return { rows, headers, sha256: createHash("sha256").update(bytes).digest("hex") }
}

/** Section selector presents the actual JSON subtree, with the full document available. */
export async function showArchiveJson(page: Page, file: string) {
  const bytes = await readFile(file)
  const archive = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>
  if (archive.format !== "benevol-event-archive" || archive.version !== 1) throw new Error("Actual event archive required")
  const sections = ["event", "shifts", "registrations", "pages", "questions", "sectorLeaders", "milestones", "log", "counts", "organization"]
  await page.setContent(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Lecture de l'archive JSON</title><style>
  body{font:18px Arial,sans-serif;color:#172033;background:white;margin:24px}h1{font-size:26px}p{line-height:1.4}select{font:inherit;padding:7px;min-width:260px}pre{font:17px/1.45 monospace;background:#f2f5f9;padding:16px;max-height:480px;overflow:auto;border:1px solid #aab3c0;white-space:pre-wrap;overflow-wrap:anywhere}
  </style></head><body><h1>Lecture de l'archive JSON</h1><p>Visualiseur de démonstration en lecture seule, pas une fonction de restauration. Les données du fichier ne sont pas modifiées.</p><label for="archive-section">Partie du fichier :</label> <select id="archive-section"><option value="">Document complet</option>${sections.map(key => `<option value="${key}">${key}</option>`).join("")}</select><pre>${escape(JSON.stringify(archive, null, 2))}</pre></body></html>`)
  await page.evaluate(data => {
    document.querySelector<HTMLSelectElement>("#archive-section")!.addEventListener("change", event => {
      const key = (event.target as HTMLSelectElement).value
      const pre = document.querySelector("pre")!
      pre.textContent = JSON.stringify(key ? { [key]: data[key] } : data, null, 2)
      pre.scrollTop = 0
    })
  }, archive)
  await page.evaluate(() => document.fonts.ready)
  return { sha256: createHash("sha256").update(bytes).digest("hex"), sections }
}

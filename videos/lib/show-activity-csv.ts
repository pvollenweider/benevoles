// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { parse } from "csv-parse/sync"
import type { Page } from "playwright"

/** Faithful read-only view of the actual downloaded CSV, explicitly not application UI. */
export async function showActivityCsv(page: Page, file: string) {
  const bytes = await readFile(file)
  const [headers, ...rows] = parse(bytes, { bom: true, delimiter: ";", relax_column_count: false }) as string[][]
  if (JSON.stringify(headers) !== JSON.stringify(["Date", "Acteur", "Type d'acteur", "Action", "Entité", "Identifiant", "Changements"]) || !rows.length) throw new Error("Actual activity CSV required")
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
  await page.setContent(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Lecture du CSV téléchargé</title><style>
  body{font:18px Arial,sans-serif;background:#fff;color:#172033;margin:24px}h1{font-size:26px}p{line-height:1.5}
  .scroll{max-height:540px;overflow:auto;border:1px solid #aab3c0}table{border-collapse:collapse;white-space:nowrap}th,td{padding:12px 16px;border-bottom:1px solid #dce1e8;text-align:left}th{position:sticky;top:0;background:#172033;color:white}tbody tr:nth-child(even){background:#f2f5f9}caption{text-align:left;padding:12px;font-weight:bold}
  </style></head><body><h1>Lecture du CSV téléchargé</h1><p>Visualiseur de démonstration, pas un écran de l’application. Le fichier reste inchangé.</p><p>${rows.length} entrées · ${headers.length} colonnes · des plus anciennes aux plus récentes.</p><div class="scroll"><table><caption>Journal de l’organisation — données fictives</caption><thead><tr>${headers.map(header => `<th>${escape(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></body></html>`)
  await page.evaluate(() => document.fonts.ready)
  if (await page.locator("tbody tr").count() !== rows.length) throw new Error("Read-only viewer omitted a CSV row")
  return { rows: rows.length, columns: headers, sha256: createHash("sha256").update(bytes).digest("hex") }
}

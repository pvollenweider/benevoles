// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile } from "node:fs/promises"
import { parse } from "csv-parse/sync"
import type { Page } from "playwright"

/** Read-only viewer of the actual downloaded bytes, never a simulated application page. */
export async function showDownloadedCsv(page: Page, file: string) {
  const bytes = await readFile(file)
  const rows = parse(bytes, { bom: true, delimiter: ";", relax_column_count: false }) as string[][]
  if (rows.length < 2) throw new Error("Downloaded CSV has no data")
  const [headers, ...data] = rows
  const emailColumn = headers.indexOf("Email")
  if (emailColumn < 0 || !headers.includes("Présent") || !headers.includes("Pointé le")) throw new Error("Not an attendance export")
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
  const people = new Map(data.map(row => [row[emailColumn], `${row[headers.indexOf("Prénom")]} ${row[headers.indexOf("Nom")]} — ${row[emailColumn]}`]))
  await page.setContent(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Lecture du CSV téléchargé</title><style>
    body{font:18px Arial,sans-serif;color:#172033;margin:24px;background:white}h1{font-size:24px}p{line-height:1.5}
    .scroll{max-height:560px;overflow:auto;border:1px solid #aab3c0}table{border-collapse:collapse;white-space:nowrap}
    th{position:sticky;top:0;background:#172033;color:white;text-align:left}td,th{padding:12px 16px;border-bottom:1px solid #dde2e8}
    tbody tr:nth-child(even){background:#f2f5f9}caption{text-align:left;padding:12px;font-weight:bold}
    th:first-child,td:first-child{position:sticky;left:0;box-shadow:2px 0 3px #aab3c0}th:first-child{z-index:2}td:first-child{background:white}
    </style></head><body><h1>Lecture du CSV téléchargé</h1>
    <p>Visualiseur de démonstration, pas un écran de l’application. Toutes les lignes et colonnes du fichier sont conservées, sans modification.</p>
    <p>${data.length} inscriptions · ${new Set(data.map(row => row[emailColumn])).size} personnes. Une ligne par créneau : les réponses d’une même personne peuvent se répéter.</p>
    <label for="csv-person">Lecture d’une personne dans le fichier :</label> <select id="csv-person" style="font:inherit;padding:6px;max-width:700px"><option value="">Toutes les personnes</option>${[...people].map(([email, name]) => `<option value="${escape(email)}">${escape(name)}</option>`).join("")}</select>
    <p id="csv-view-count">${data.length} lignes affichées sur ${data.length}.</p>
    <div class="scroll"><table><caption>Export des présences — données fictives</caption><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${data.map(row => `<tr data-email="${escape(row[emailColumn])}">${row.map(v => `<td>${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></body></html>`)
  await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>("#csv-person")!
    select.addEventListener("change", () => {
      const rows = [...document.querySelectorAll<HTMLTableRowElement>("tbody tr")]
      for (const row of rows) row.hidden = !!select.value && row.dataset.email !== select.value
      document.querySelector("#csv-view-count")!.textContent = `${rows.filter(row => !row.hidden).length} lignes affichées sur ${rows.length}. Le fichier téléchargé reste inchangé.`
    })
  })
  await page.evaluate(() => document.fonts.ready)
  if (await page.locator("tbody tr").count() !== data.length) throw new Error("CSV viewer omitted a row")
  return { headers, rows: data, people: new Set(data.map(row => row[emailColumn])).size }
}

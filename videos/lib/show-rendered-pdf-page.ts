// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Page } from "playwright"
import { readFile } from "node:fs/promises"

/** Read-only pixels from the actual exported PDF, never a simulated print dialog. */
export async function showRenderedPdfPage(page: Page, file: string, label: string) {
  const bytes = await readFile(file)
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("Expected rendered PDF page")
  const escapedLabel = label.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
  const html = `<html lang="fr"><head><meta charset="utf-8"><style>body{margin:16px;font:18px Arial;background:#eef1f5}h1{font-size:22px}img{display:block;width:740px;max-width:100%;margin:auto;background:white}</style></head><body><h1>Lecture du PDF réel — ${escapedLabel}</h1><p>Aperçu de contrôle, distinct de la boîte d’impression du navigateur.</p><img alt="Page du PDF généré par l’application" src="data:image/png;base64,${bytes.toString("base64")}"></body></html>`
  // A document navigation also renews the browser's chapter-overlay host.
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await page.locator("img").evaluate(async img => { await (img as HTMLImageElement).decode() })
}

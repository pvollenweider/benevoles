// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Browser tab titles set from client components (#1340). The instance's name is a runtime value
 * (`siteName()`, src/lib/site.ts: SITE_NAME or the domain), which the browser bundle cannot read:
 * the root layout writes it into `<meta name="application-name">`, and the title reads it back.
 * Without that tag (a test, an old cached page), the title is left without a suffix rather than
 * naming the wrong instance.
 */
export function siteNameFromPage(doc: Pick<Document, "querySelector"> = document): string | null {
  const name = doc.querySelector('meta[name="application-name"]')?.getAttribute("content")?.trim()
  return name || null
}

/** « <title> — <instance name> », or the title alone when the page does not carry the name. */
export function titleWithSiteName(title: string, doc: Pick<Document, "querySelector"> = document): string {
  const name = siteNameFromPage(doc)
  return name ? `${title} — ${name}` : title
}

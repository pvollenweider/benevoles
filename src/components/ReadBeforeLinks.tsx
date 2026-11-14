// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReadBeforePage } from "@/lib/shift-info"

/**
 * Links to the information pages attached to a poste (#1324): one link per page, a list when
 * there are several, same tab. With `label`, the whole sentence is the link (« À lire avant ton
 * créneau : Tenir la caisse »), so it makes sense out of its context; without, the page's title
 * is the link, for a block whose heading already says what the pages are. `py-1` gives the link
 * a 24 px target.
 */
export default function ReadBeforeLinks({ pages, label, className = "" }: { pages: readonly ReadBeforePage[]; label?: string; className?: string }) {
  if (pages.length === 0) return null
  const link = (p: ReadBeforePage) => (
    <a href={p.url} className="py-1 inline-block text-sm text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 break-words">
      {label ? `${label} : ${p.title}` : p.title}
    </a>
  )
  if (pages.length === 1) return <p className={className}>{link(pages[0])}</p>
  return <ul role="list" className={`space-y-0.5 ${className}`}>{pages.map((p) => <li key={p.url}>{link(p)}</li>)}</ul>
}

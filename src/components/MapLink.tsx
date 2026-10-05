// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { MAP_LINK_LABEL, MAP_LINK_SR_SUFFIX } from "@/lib/map-link"

/**
 * « Voir sur la carte » to OpenStreetMap, in a new tab: a visible arrow says so (hidden from
 * screen readers, which hear it in the suffix), and the hidden text names the place, so the
 * link makes sense out of context.
 */
export default function MapLink({ href, place, className = "" }: { href: string; place: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`underline underline-offset-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${className}`}>
      {MAP_LINK_LABEL}<span aria-hidden="true"> ↗</span><span className="sr-only">, {place}{MAP_LINK_SR_SUFFIX}</span>
    </a>
  )
}

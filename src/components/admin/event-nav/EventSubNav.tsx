// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import type { SubNavLink } from "@/lib/event-nav"

/**
 * The pages of the current tab when it groups several (Créneaux, Inscriptions, Partage,
 * Réglages): lighter than the tabs, same marking rules (aria-current, underline and weight, a
 * Canvas-coloured border in forced colours on the others so the mark stays readable there).
 */
export default function EventSubNav({ tabLabel, links }: { tabLabel: string; links: SubNavLink[] }) {
  return (
    <nav aria-label={`Pages de la section ${tabLabel}`}>
      <ul role="list" className="flex flex-wrap gap-x-4 gap-y-1">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={l.current}
              className={`inline-flex min-h-9 items-center border-b-2 text-sm rounded-t focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                l.current
                  ? "border-blue-600 font-semibold text-gray-900"
                  : "border-transparent text-gray-700 underline underline-offset-2 hover:text-gray-900 forced-colors:border-[Canvas]"
              }`}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

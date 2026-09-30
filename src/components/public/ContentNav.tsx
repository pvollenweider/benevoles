"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CONTENT_NAV } from "@/lib/doc-pages"

/** The content navigation (features, guides), marking the current page in words and weight, not colour only. */
export default function ContentNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Fonctionnalités et guides" className="flex flex-wrap gap-x-4 -my-3 text-sm">
      {CONTENT_NAV.map((g) => (
        <Link
          key={g.path}
          href={g.path}
          aria-current={pathname === g.path ? "page" : undefined}
          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors py-3 flex items-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400 aria-[current=page]:font-semibold aria-[current=page]:text-gray-900 dark:aria-[current=page]:text-gray-100 aria-[current=page]:underline aria-[current=page]:underline-offset-4"
        >
          {g.title}
        </Link>
      ))}
    </nav>
  )
}

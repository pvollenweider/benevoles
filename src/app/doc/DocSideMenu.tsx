import Link from "next/link"
import type { DocMenuGroup } from "@/lib/doc-navigation"
import { docUnitHref } from "@/lib/doc-href"

const focusRing = "rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

/**
 * The side menu of a unit's page (#649), from `lg` only (below, « Dans ce thème » at the bottom of
 * the page plays its part, and the menu isn't rendered visible twice): every group of the
 * documentation, for every audience, in the order of /doc. Each group is a native disclosure
 * (<details>, keyboard and screen reader friendly without script); only the current unit's group
 * is open. The current unit is marked by aria-current, its weight and a background, not by colour
 * alone. Sticky beside the content, never over it, and scrolls on its own when taller than the
 * window. Rendered outside <main>: « Aller au contenu » skips it.
 */
export default function DocSideMenu({ groups, currentSlug }: { groups: readonly DocMenuGroup[]; currentSlug: string }) {
  return (
    <nav aria-label="Documentation" className="hidden lg:block lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto py-12 px-2 text-sm">
      <ul className="space-y-1">
        {groups.map(({ group, units, current }) => (
          <li key={group.id}>
            <details open={current} className="group">
              <summary className={`flex cursor-pointer list-none items-start gap-1.5 px-2 py-1.5 font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 [&::-webkit-details-marker]:hidden ${focusRing}`}>
                <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-gray-500 dark:text-gray-400 group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
                {group.title}
              </summary>
              <ul className="mt-1 mb-2 ml-4 space-y-0.5 border-l border-gray-200 dark:border-gray-700 pl-2">
                {units.map((unit) => (
                  <li key={unit.slug}>
                    <Link
                      href={docUnitHref(unit.slug)}
                      aria-current={unit.slug === currentSlug ? "page" : undefined}
                      className={`block px-2 py-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 aria-[current=page]:bg-blue-50 aria-[current=page]:font-semibold aria-[current=page]:text-blue-800 dark:aria-[current=page]:bg-gray-800 dark:aria-[current=page]:text-white ${focusRing}`}
                    >
                      {unit.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </nav>
  )
}

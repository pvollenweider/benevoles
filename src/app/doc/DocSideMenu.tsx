import Link from "next/link"
import type { DocMenuSection } from "@/lib/doc-navigation"
import { docUnitHref } from "@/lib/doc-href"
import { freshness } from "@/lib/freshness"
import FreshnessBadge from "@/components/public/FreshnessBadge"

const focusRing = "rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

/**
 * The side menu of a unit's page (#649), from `lg` only (below, « Dans ce thème » at the bottom of
 * the page plays its part, and the menu isn't rendered visible twice): every group of the
 * documentation, under a visible label per audience, « Bénévoles », « Organisateurs », then
 * « Commun », in that order on every page (docMenuSections, src/lib/doc-navigation.ts). One
 * navigation landmark; each label names its list (aria-labelledby), and is no heading: the menu
 * comes before <main> in the DOM (and in the focus order, as on screen), so a heading here would
 * come before the page's <h1>. Not regions either. Each group
 * is a native disclosure (<details>, keyboard and screen reader friendly without script); only
 * the current unit's group is open, the order never changes. The current unit is marked by
 * aria-current, its weight and a background, not by colour alone. Sticky beside the content,
 * never over it, and scrolls on its own when taller than the window. Rendered outside <main>:
 * « Aller au contenu » skips it.
 */
export default function DocSideMenu({ sections, currentSlug, now = new Date() }: { sections: readonly DocMenuSection[]; currentSlug: string; now?: Date }) {
  return (
    <nav aria-label="Documentation" className="hidden lg:block lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto py-12 px-2 text-sm">
      {sections.map(({ audience, title, groups }, i) => (
        <div key={audience} className={i > 0 ? "mt-6" : undefined}>
          <p id={`doc-menu-${audience}`} className="px-2 pb-1 text-sm font-semibold text-gray-600 dark:text-gray-400">{title}</p>
          <ul aria-labelledby={`doc-menu-${audience}`} className="space-y-1">
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
                    {units.map((unit) => {
                      const label = freshness(unit.freshness ?? {}, now)
                      return (
                      <li key={unit.slug}>
                        <Link
                          href={docUnitHref(unit.slug)}
                          aria-current={unit.slug === currentSlug ? "page" : undefined}
                          className={`block px-2 py-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 aria-[current=page]:bg-blue-50 aria-[current=page]:font-semibold aria-[current=page]:text-blue-800 dark:aria-[current=page]:bg-gray-800 dark:aria-[current=page]:text-white ${focusRing}`}
                        >
                          {unit.title}
                          {label && <FreshnessBadge kind={label} separated className="ml-1.5 align-text-bottom" />}
                        </Link>
                      </li>
                      )
                    })}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
